import type { FastifyInstance } from 'fastify'
import { resolveCellarOwner } from '../lib/ownership.js'
import { prisma } from '../lib/prisma.js'
import { serializeBottle } from '../services/serialize.js'
import { drinkingWindow } from '../services/wines.js'

export default async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (req) => {
    const ownerId = await resolveCellarOwner(req)
    const bottles = await prisma.bottle.findMany({
      where: { status: 'IN_CELLAR', ownerId },
      include: { wine: { include: { foodTags: { include: { foodTag: true } } } } },
    })

    const byColor: Record<string, number> = {}
    const byRegion: Record<string, number> = {}
    const byVintage: Record<string, number> = {}
    let estimatedValue = 0
    let ratedCount = 0
    let ratingSum = 0

    for (const bottle of bottles) {
      const wine = bottle.wine
      byColor[wine.color ?? 'INCONNU'] = (byColor[wine.color ?? 'INCONNU'] ?? 0) + 1
      if (wine.region) byRegion[wine.region] = (byRegion[wine.region] ?? 0) + 1
      if (wine.vintage) byVintage[wine.vintage] = (byVintage[wine.vintage] ?? 0) + 1

      // On préfère le prix d'achat réel quand il est connu, sinon l'estimation Vivino.
      estimatedValue += bottle.purchasePrice ?? wine.priceAvg ?? 0

      if (wine.vivinoRating != null) {
        ratingSum += wine.vivinoRating
        ratedCount += 1
      }
    }

    const drunk = await prisma.bottle.count({ where: { status: 'DRUNK', ownerId } })

    return {
      inCellar: bottles.length,
      drunk,
      estimatedValue: Math.round(estimatedValue),
      averageRating: ratedCount > 0 ? Number((ratingSum / ratedCount).toFixed(2)) : null,
      byColor,
      byRegion: Object.fromEntries(
        Object.entries(byRegion)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12),
      ),
      byVintage,
    }
  })

  /**
   * Bouteilles dont la fenêtre de dégustation se referme dans les 12 mois.
   *
   * C'est la vraie valeur ajoutée sur Vivino : savoir ce qu'il faut ouvrir maintenant
   * plutôt que de découvrir une bouteille passée.
   */
  app.get('/drink-soon', async (req) => {
    const ownerId = await resolveCellarOwner(req)
    const bottles = await prisma.bottle.findMany({
      where: { status: 'IN_CELLAR', ownerId },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })

    const year = new Date().getFullYear()
    const results = []

    for (const bottle of bottles) {
      const serialized = serializeBottle(bottle)
      const window = drinkingWindow(serialized.wine)
      if (!window) continue

      const status =
        year > window.to ? 'PAST' : year >= window.from ? 'READY' : 'WAIT'

      if (status === 'PAST' || (status === 'READY' && window.to - year <= 1)) {
        results.push({ bottle: serialized, window, status })
      }
    }

    results.sort((a, b) => a.window.to - b.window.to)
    return { bottles: results }
  })

  /** Historique de dégustation — ce que Vivino facturait. */
  app.get('/history', async (req) => {
    const ownerId = await resolveCellarOwner(req)
    const { limit } = req.query as { limit?: string }
    const bottles = await prisma.bottle.findMany({
      where: { status: 'DRUNK', ownerId },
      orderBy: { drunkAt: 'desc' },
      take: Math.min(Number.parseInt(limit ?? '100', 10) || 100, 500),
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })

    return { bottles: bottles.map(serializeBottle) }
  })
}
