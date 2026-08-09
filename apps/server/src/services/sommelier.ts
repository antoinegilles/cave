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
          id: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['id', 'reason'],
      },
    },
    note: { type: 'STRING', nullable: true },
  },
  required: ['recommendations', 'note'],
} as const

const SYSTEM_INSTRUCTION = `Tu es sommelier. On te donne la liste des vins réellement présents
dans une cave, puis un repas.

Règles :
- Choisis au maximum 3 vins, UNIQUEMENT parmi la liste fournie, via leur identifiant exact.
- Si aucun vin ne convient vraiment, renvoie une liste vide et explique-le dans "note".
- "reason" : une phrase courte en français expliquant l'accord (30 mots maximum).
- "note" : une remarque de service utile (température, carafage), ou null.
- N'invente aucun vin absent de la liste.`

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

interface CellarLine {
  bottleId: string
  label: string
  slotNumber: number | null
  rackName: string | null
}

/** Une ligne compacte par vin — c'est le poste de dépense en tokens, on le garde serré. */
async function buildCellarContext(): Promise<{ lines: string[]; index: Map<string, CellarLine> }> {
  const bottles = await prisma.bottle.findMany({
    where: { status: 'IN_CELLAR' },
    take: config.AI_MAX_CONTEXT_WINES,
    orderBy: { addedAt: 'desc' },
    include: {
      wine: { include: { foodTags: { include: { foodTag: true } } } },
      slot: { include: { rack: true } },
    },
  })

  const index = new Map<string, CellarLine>()
  const lines: string[] = []

  for (const bottle of bottles) {
    const wine = bottle.wine
    const label = [wine.producer, wine.name, wine.vintage].filter(Boolean).join(' ')
    const foods = wine.foodTags.map((ft) => getFoodTag(ft.foodTag.slug)?.labelFr ?? ft.foodTag.slug)

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

    lines.push(
      [
        bottle.id,
        label,
        wine.color ?? '?',
        wine.region ?? '?',
        wine.vivinoRating != null ? `${wine.vivinoRating}/5` : '-',
        foods.join('/') || '-',
        profile || '-',
      ].join('|'),
    )

    index.set(bottle.id, {
      bottleId: bottle.id,
      label,
      slotNumber: bottle.slot?.number ?? null,
      rackName: bottle.slot?.rack.name ?? null,
    })
  }

  return { lines, index }
}

export async function askSommelier(userId: string, prompt: string): Promise<SommelierResponse> {
  // Le quota est vérifié puis consommé immédiatement par la création de la ligne AiQuery :
  // deux requêtes simultanées ne peuvent pas passer toutes les deux sur le dernier crédit.
  if ((await countTodayQueries(userId)) >= config.AI_DAILY_QUOTA) {
    throw new QuotaExceededError()
  }

  const query = await prisma.aiQuery.create({ data: { userId, prompt } })

  try {
    const { lines, index } = await buildCellarContext()

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
      recommendations: { id: string; reason: string }[]
      note: string | null
    }>({
      systemInstruction: SYSTEM_INSTRUCTION,
      parts: [
        {
          text: `Vins en cave (format id|nom|couleur|région|note|accords|profil) :\n${lines.join('\n')}\n\nRepas : ${prompt}`,
        },
      ],
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 400,
      temperature: 0.4,
      enableGrounding: config.AI_ENABLE_GROUNDING,
    })

    // Le modèle peut halluciner un identifiant : on ne garde que les bouteilles réellement
    // présentes en cave, sinon on afficherait un emplacement qui n'existe pas.
    const recommendations = (data.recommendations ?? [])
      .map((rec) => {
        const found = index.get(rec.id)
        if (!found) return null
        return {
          bottleId: found.bottleId,
          slotNumber: found.slotNumber,
          rackName: found.rackName,
          label: found.label,
          reason: rec.reason,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 3)

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
