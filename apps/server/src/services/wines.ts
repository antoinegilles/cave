import type { WineData } from '@cave/shared'
import { FOOD_TAGS } from '@cave/shared'
import { buildDedupeKey } from '../lib/dedupe.js'
import { prisma } from '../lib/prisma.js'

/**
 * Persiste une fiche vin, en réutilisant la ligne existante quand c'est le même vin.
 *
 * Deux clés de déduplication : l'identifiant Vivino quand on l'a (le plus fiable), sinon
 * une clé normalisée producteur+nom+millésime. Ranger 6 bouteilles du même Bordeaux ne doit
 * créer qu'un seul `Wine`.
 */
export async function upsertWine(data: WineData): Promise<string> {
  const dedupeKey = buildDedupeKey(data.producer, data.name, data.vintage)

  const existing = data.vivinoId
    ? await prisma.wine.findFirst({
        where: { OR: [{ vivinoId: data.vivinoId }, { dedupeKey }] },
        select: { id: true, source: true },
      })
    : await prisma.wine.findUnique({ where: { dedupeKey }, select: { id: true, source: true } })

  const fields = {
    name: data.name,
    producer: data.producer,
    vintage: data.vintage,
    color: data.color,
    country: data.country,
    region: data.region,
    appellation: data.appellation,
    grapes: JSON.stringify(data.grapes),
    abv: data.abv,
    description: data.description,
    producerUrl: data.producerUrl,
    imageUrl: data.imageUrl,
    vivinoId: data.vivinoId,
    vivinoUrl: data.vivinoUrl,
    vivinoRating: data.vivinoRating,
    vivinoRatingCount: data.vivinoRatingCount,
    priceAvg: data.priceAvg,
    structure: JSON.stringify(data.structure),
    flavors: JSON.stringify(data.flavors),
    source: data.source,
    dedupeKey,
    fetchedAt: new Date(),
  }

  let wineId: string

  if (existing) {
    // Une fiche Vivino ne doit pas être écrasée par une saisie manuelle plus pauvre.
    const downgrade = existing.source === 'VIVINO' && data.source !== 'VIVINO'
    wineId = existing.id
    if (!downgrade) {
      await prisma.wine.update({ where: { id: existing.id }, data: fields })
    }
  } else {
    const created = await prisma.wine.create({ data: fields })
    wineId = created.id
  }

  await syncFoodTags(wineId, data.foodTags)
  return wineId
}

/** Remplace les accords d'un vin. Les tags inconnus du référentiel sont ignorés. */
export async function syncFoodTags(wineId: string, slugs: string[]): Promise<void> {
  if (slugs.length === 0) return

  const known = new Set(FOOD_TAGS.map((t) => t.slug))
  const valid = [...new Set(slugs.filter((s) => known.has(s)))]
  if (valid.length === 0) return

  const tags = await prisma.foodTag.findMany({
    where: { slug: { in: valid } },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.wineFoodTag.deleteMany({ where: { wineId } }),
    prisma.wineFoodTag.createMany({
      data: tags.map((tag) => ({ wineId, foodTagId: tag.id })),
    }),
  ])
}

/**
 * Fenêtre de garde estimée.
 *
 * Approximation assumée : sans analyse du millésime réel, on se cale sur le potentiel de
 * garde typique du style. Sert à afficher « à boire » / « à attendre », pas à trancher un
 * débat d'œnologue.
 */
export function drinkingWindow(wine: {
  vintage: number | null
  color: string | null
  region: string | null
  structure: { tannin: number | null }
}): { from: number; to: number } | null {
  if (!wine.vintage) return null

  const region = (wine.region ?? '').toLowerCase()
  let years = 3

  switch (wine.color) {
    case 'RED':
      years = 6
      if ((wine.structure.tannin ?? 0) >= 4) years = 12
      if (/bordeaux|medoc|margaux|pauillac|saint.?julien|pomerol|saint.?emilion/.test(region)) years = 15
      if (/bourgogne|burgundy|gevrey|vosne|nuits/.test(region)) years = 12
      if (/beaujolais/.test(region)) years = 3
      break
    case 'WHITE':
      years = 4
      if (/chablis|meursault|puligny|chassagne|corton/.test(region)) years = 8
      if (/alsace|riesling/.test(region)) years = 8
      break
    case 'SPARKLING':
      years = /champagne/.test(region) ? 8 : 3
      break
    case 'DESSERT':
    case 'FORTIFIED':
      years = 20
      break
    case 'ROSE':
      years = 2
      break
  }

  // On considère la fenêtre ouverte sur le dernier tiers du potentiel de garde.
  const from = wine.vintage + Math.max(1, Math.round(years * 0.35))
  return { from, to: wine.vintage + years }
}
