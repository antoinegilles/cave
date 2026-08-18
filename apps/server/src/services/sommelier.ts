import { FEATURE_FLAGS, type SommelierResponse, getFoodTag } from '@cave/shared'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'
import { generateStructured } from './gemini.js'

/**
 * Sommelier IA.
 *
 * Trois garde-fous, tous adossés à la base pour survivre à un redémarrage du conteneur :
 * le feature flag, le quota journalier par utilisateur, et le plafond de contexte.
 *
 * Le contexte n'est jamais la base brute : une ligne compacte par vin, plafonnée, ce qui
 * maintient l'entrée autour du millier de tokens et garde l'usage dans le free tier.
 */

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          wineId: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['wineId', 'reason'],
      },
    },
    note: { type: 'STRING', nullable: true },
  },
  required: ['recommendations', 'note'],
} as const

const SYSTEM_INSTRUCTION = `Tu es le sommelier de cette cave. On te donne la liste des vins
réellement présents, puis une recherche pouvant décrire un plat, un domaine, une cuvée ou une
envie. Tu réponds comme un sommelier à qui l'on demande conseil : chaleureux, concret, sans
jargon inutile. Tutoie la personne.

Règles :
- Choisis au maximum 3 vins, UNIQUEMENT parmi la liste fournie, via leur wineId exact.
- Classe-les du plus au moins pertinent : le premier est ta recommandation.
- Si aucun vin ne convient vraiment, renvoie une liste vide et dis-le franchement dans "note".
- "reason" : deux phrases maximum, 45 mots au total. La première dit pourquoi ce vin va avec
  la demande ; la seconde donne un conseil concret de service (température, carafage, ordre de
  passage) ou ce qui le distingue des autres bouteilles de la cave.
- "note" : une remarque finale utile, ou null. Ne répète pas ce qui est déjà dans un "reason".
- N'invente aucun vin absent de la liste, ne cite aucun millésime ni domaine qui n'y figure pas.`

export async function isSommelierEnabled(): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({ where: { key: FEATURE_FLAGS.AI_SOMMELIER } })
  return flag?.enabled ?? config.AI_SOMMELIER_ENABLED
}

/** Début de la journée courante, en heure locale du serveur. */
function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function countTodayQueries(userId: string): Promise<number> {
  return prisma.aiQuery.count({
    where: { userId, createdAt: { gte: startOfToday() }, error: null },
  })
}

export async function remainingQuota(userId: string): Promise<number> {
  return Math.max(0, config.AI_DAILY_QUOTA - (await countTodayQueries(userId)))
}

export class QuotaExceededError extends Error {
  constructor() {
    super(`Quota atteint : ${config.AI_DAILY_QUOTA} recherches IA par jour. Réessaie demain.`)
    this.name = 'QuotaExceededError'
  }
}

interface CellarLocation {
  bottleId: string
  rackId: string | null
  rackName: string | null
  slotNumber: number | null
}

interface CellarWine {
  wineId: string
  representativeBottleId: string
  label: string
  locations: CellarLocation[]
}

function oneLine(value: string): string {
  return value.replace(/[|\r\n]+/g, ' ').trim()
}

/** Les emplacements utilisent aussi `:` et `,` comme séparateurs internes. */
function oneLocationCell(value: string): string {
  return value.replace(/[|,:\r\n]+/g, ' ').trim()
}

/**
 * Une ligne compacte par `Wine`, avec tous ses exemplaires encore en cave. La limite porte
 * sur les vins, pas sur les bouteilles : un carton ne doit jamais perdre cinq emplacements
 * simplement parce que ses exemplaires occupent le plafond de contexte.
 */
async function buildCellarContext(
  ownerId: string,
): Promise<{ lines: string[]; index: Map<string, CellarWine> }> {
  const wines = await prisma.wine.findMany({
    where: { bottles: { some: { status: 'IN_CELLAR', ownerId } } },
    take: config.AI_MAX_CONTEXT_WINES,
    orderBy: { updatedAt: 'desc' },
    include: {
      foodTags: { include: { foodTag: true } },
      bottles: {
        where: { status: 'IN_CELLAR', ownerId },
        orderBy: { addedAt: 'desc' },
        include: { slot: { include: { rack: true } } },
      },
    },
  })

  const index = new Map<string, CellarWine>()
  const lines: string[] = []

  for (const wine of wines) {
    const representative = wine.bottles.find((bottle) => bottle.slot !== null) ?? wine.bottles[0]
    if (!representative) continue

    const label = oneLine([wine.producer, wine.name, wine.vintage].filter(Boolean).join(' '))
    const foods = wine.foodTags.map((ft) => getFoodTag(ft.foodTag.slug)?.labelFr ?? ft.foodTag.slug)
    const locations = wine.bottles.map((bottle) => ({
      bottleId: bottle.id,
      rackId: bottle.slot?.rack.id ?? null,
      rackName: bottle.slot?.rack.name ?? null,
      slotNumber: bottle.slot?.number ?? null,
    }))

    let structure: Record<string, number | null> = {}
    try {
      structure = JSON.parse(wine.structure) as Record<string, number | null>
    } catch {
      structure = {}
    }
    const profile = Object.entries(structure)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k[0]}${v}`)
      .join('')

    const compactLocations = locations
      .map((location) =>
        [
          location.bottleId,
          location.rackId ?? '-',
          oneLocationCell(location.rackName ?? '-'),
          location.slotNumber ?? '-',
        ].join(':'),
      )
      .join(',')

    lines.push(
      [
        wine.id,
        label,
        wine.color ?? '?',
        oneLine(wine.region ?? '?'),
        wine.vivinoRating != null ? `${wine.vivinoRating}/5` : '-',
        foods.map(oneLine).join('/') || '-',
        profile || '-',
        compactLocations,
      ].join('|'),
    )

    index.set(wine.id, {
      wineId: wine.id,
      representativeBottleId: representative.id,
      label,
      locations,
    })
  }

  return { lines, index }
}

const quotaTails = new Map<string, Promise<void>>()

/**
 * Sérialise la courte réservation par utilisateur. Le déploiement est mono-processus et le
 * décompte reste en base : un redémarrage conserve donc le quota, tandis que deux onglets ne
 * peuvent plus réserver le même dernier crédit.
 */
async function reserveQuery(userId: string, prompt: string) {
  const previous = quotaTails.get(userId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => gate)
  quotaTails.set(userId, tail)

  await previous.catch(() => undefined)
  try {
    if ((await countTodayQueries(userId)) >= config.AI_DAILY_QUOTA) {
      throw new QuotaExceededError()
    }
    return await prisma.aiQuery.create({ data: { userId, prompt } })
  } finally {
    release()
    if (quotaTails.get(userId) === tail) quotaTails.delete(userId)
  }
}

export async function askSommelier(
  userId: string,
  prompt: string,
  ownerId = userId,
): Promise<SommelierResponse> {
  const query = await reserveQuery(userId, prompt)

  try {
    const { lines, index } = await buildCellarContext(ownerId)

    if (lines.length === 0) {
      // Rien en cave : inutile de dépenser un appel. On rembourse le crédit.
      await prisma.aiQuery.delete({ where: { id: query.id } })
      return {
        recommendations: [],
        note: 'Ta cave est vide — ajoute des bouteilles avant de demander un accord.',
        quotaRemaining: await remainingQuota(userId),
      }
    }

    const { data, usage } = await generateStructured<{
      recommendations: { wineId: string; reason: string }[]
      note: string | null
    }>({
      systemInstruction: SYSTEM_INSTRUCTION,
      parts: [
        {
          text: `Vins en cave (format wineId|nom|couleur|région|note|accords|profil|bottleId:rackId:casier:slot,...) :\n${lines.join('\n')}\n\nRecherche : ${prompt}`,
        },
      ],
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      // Des commentaires plus longs qu'avant : une sortie tronquée casserait le JSON.
      maxOutputTokens: 700,
      temperature: 0.4,
      enableGrounding: config.AI_ENABLE_GROUNDING,
    })

    // Le modèle peut halluciner ou répéter un wineId. Le serveur reste la source de vérité :
    // il reconstruit les emplacements depuis l'index contrôlé et ne garde qu'un vin unique.
    const recommendations: SommelierResponse['recommendations'] = []
    const seenWineIds = new Set<string>()
    for (const rec of data.recommendations ?? []) {
      if (recommendations.length >= 3) break
      if (!rec || typeof rec.wineId !== 'string' || typeof rec.reason !== 'string') continue
      if (seenWineIds.has(rec.wineId)) continue

      const found = index.get(rec.wineId)
      if (!found) continue
      seenWineIds.add(rec.wineId)
      recommendations.push({
        wineId: found.wineId,
        representativeBottleId: found.representativeBottleId,
        label: found.label,
        reason: rec.reason,
        locations: found.locations,
      })
    }

    await prisma.aiQuery.update({
      where: { id: query.id },
      data: {
        response: JSON.stringify({ recommendations, note: data.note }),
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
      },
    })

    return {
      recommendations,
      note: data.note ?? null,
      quotaRemaining: await remainingQuota(userId),
    }
  } catch (error) {
    // Un appel en échec ne doit pas consommer un crédit : on marque la ligne en erreur,
    // et `countTodayQueries` l'exclut du décompte.
    await prisma.aiQuery.update({
      where: { id: query.id },
      data: { error: (error as Error).message.slice(0, 500) },
    })
    throw error
  }
}
