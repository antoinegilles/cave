import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  countQueries: vi.fn(),
  createQuery: vi.fn(),
  updateQuery: vi.fn(),
  deleteQuery: vi.fn(),
  findManyWines: vi.fn(),
  generateStructured: vi.fn(),
}))

vi.mock('../config.js', () => ({
  config: {
    AI_DAILY_QUOTA: 3,
    AI_MAX_CONTEXT_WINES: 2,
    AI_ENABLE_GROUNDING: false,
    AI_SOMMELIER_ENABLED: true,
  },
}))

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    aiQuery: {
      count: mocks.countQueries,
      create: mocks.createQuery,
      update: mocks.updateQuery,
      delete: mocks.deleteQuery,
    },
    wine: { findMany: mocks.findManyWines },
  },
}))

vi.mock('./gemini.js', () => ({ generateStructured: mocks.generateStructured }))

import { askSommelier, QuotaExceededError } from './sommelier.js'

function bottle(id: string, rackId: string, rackName: string, slotNumber: number) {
  return {
    id,
    addedAt: new Date('2026-08-17T10:00:00Z'),
    slot: { number: slotNumber, rack: { id: rackId, name: rackName } },
  }
}

function wine(
  id: string,
  name: string,
  bottles: ReturnType<typeof bottle>[],
) {
  return {
    id,
    name,
    producer: 'Domaine Test',
    vintage: 2020,
    color: 'RED',
    region: 'Bordeaux',
    vivinoRating: 4.1,
    structure: '{"tannin":4}',
    foodTags: [],
    bottles,
  }
}

describe('askSommelier — contexte et recommandations par Wine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countQueries.mockResolvedValueOnce(0).mockResolvedValue(1)
    mocks.createQuery.mockResolvedValue({ id: 'query-1' })
    mocks.updateQuery.mockResolvedValue({})
  })

  it('limite les vins, conserve toutes leurs bouteilles et déduplique la sortie du modèle', async () => {
    mocks.findManyWines.mockResolvedValue([
      wine('wine-1', 'Premier', [
        bottle('bottle-15', 'rack-1', 'Cave', 15),
        bottle('bottle-16', 'rack-1', 'Cave', 16),
        bottle('bottle-12', 'rack-2', 'Cave', 12),
      ]),
      wine('wine-2', 'Second', [bottle('bottle-8', 'rack-3', 'Garage', 8)]),
    ])
    mocks.generateStructured.mockResolvedValue({
      data: {
        recommendations: [
          { wineId: 'hallucination', reason: 'Absent.' },
          { wineId: 'wine-1', reason: 'Premier accord.' },
          { wineId: 'wine-1', reason: 'Doublon.' },
          { wineId: 'wine-2', reason: 'Second accord.' },
        ],
        note: 'Servir frais.',
      },
      usage: { tokensIn: 120, tokensOut: 30 },
    })

    const result = await askSommelier('user-1', '  poisson grillé  ')

    expect(mocks.findManyWines).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: { bottles: { some: { status: 'IN_CELLAR', ownerId: 'user-1' } } },
        include: expect.objectContaining({
          bottles: expect.objectContaining({
            where: { status: 'IN_CELLAR', ownerId: 'user-1' },
          }),
        }),
      }),
    )
    const prompt = mocks.generateStructured.mock.calls[0]?.[0].parts[0].text as string
    expect(prompt).toContain('wine-1|Domaine Test Premier 2020')
    expect(prompt).toContain('bottle-15:rack-1:Cave:15')
    expect(prompt).toContain('bottle-16:rack-1:Cave:16')
    expect(prompt).toContain('bottle-12:rack-2:Cave:12')
    expect(prompt.match(/^wine-/gm)).toHaveLength(2)

    expect(result.recommendations).toEqual([
      {
        wineId: 'wine-1',
        representativeBottleId: 'bottle-15',
        label: 'Domaine Test Premier 2020',
        reason: 'Premier accord.',
        locations: [
          { bottleId: 'bottle-15', rackId: 'rack-1', rackName: 'Cave', slotNumber: 15 },
          { bottleId: 'bottle-16', rackId: 'rack-1', rackName: 'Cave', slotNumber: 16 },
          { bottleId: 'bottle-12', rackId: 'rack-2', rackName: 'Cave', slotNumber: 12 },
        ],
      },
      {
        wineId: 'wine-2',
        representativeBottleId: 'bottle-8',
        label: 'Domaine Test Second 2020',
        reason: 'Second accord.',
        locations: [
          { bottleId: 'bottle-8', rackId: 'rack-3', rackName: 'Garage', slotNumber: 8 },
        ],
      },
    ])
    expect(result.quotaRemaining).toBe(2)
    expect(mocks.updateQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'query-1' },
        data: expect.objectContaining({ tokensIn: 120, tokensOut: 30 }),
      }),
    )
  })

  it('marque un appel en erreur pour qu’il ne soit pas décompté du quota', async () => {
    mocks.findManyWines.mockResolvedValue([
      wine('wine-1', 'Premier', [bottle('bottle-15', 'rack-1', 'Cave', 15)]),
    ])
    mocks.generateStructured.mockRejectedValue(new Error('Gemini indisponible'))

    await expect(askSommelier('user-1', 'poisson')).rejects.toThrow('Gemini indisponible')
    expect(mocks.updateQuery).toHaveBeenCalledWith({
      where: { id: 'query-1' },
      data: { error: 'Gemini indisponible' },
    })
  })

  it('réserve atomiquement les trois crédits face à quatre demandes simultanées', async () => {
    let reservations = 0
    mocks.countQueries.mockImplementation(async () => reservations)
    mocks.createQuery.mockImplementation(async () => {
      reservations += 1
      return { id: `query-${reservations}` }
    })
    mocks.findManyWines.mockResolvedValue([
      wine('wine-1', 'Premier', [bottle('bottle-15', 'rack-1', 'Cave', 15)]),
    ])
    mocks.generateStructured.mockResolvedValue({
      data: { recommendations: [], note: null },
      usage: { tokensIn: 10, tokensOut: 5 },
    })

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        askSommelier('user-concurrent', `recherche ${index}`),
      ),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: expect.any(QuotaExceededError) })
    expect(mocks.createQuery).toHaveBeenCalledTimes(3)
  })

  it('neutralise les séparateurs du nom de casier dans le contexte compact', async () => {
    mocks.findManyWines.mockResolvedValue([
      wine('wine-1', 'Premier', [bottle('bottle-15', 'rack-1', 'Cave: nord, étage', 15)]),
    ])
    mocks.generateStructured.mockResolvedValue({
      data: { recommendations: [], note: null },
      usage: { tokensIn: 10, tokensOut: 5 },
    })

    await askSommelier('user-1', 'poisson')

    const prompt = mocks.generateStructured.mock.calls[0]?.[0].parts[0].text as string
    expect(prompt).toContain('bottle-15:rack-1:Cave  nord  étage:15')
    expect(prompt).not.toContain('Cave: nord, étage')
  })
})
