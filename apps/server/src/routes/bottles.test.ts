import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManySlots: vi.fn(),
  createManyBottles: vi.fn(),
  findManyBottles: vi.fn(),
  findUniqueBottle: vi.fn(),
  updateManyBottles: vi.fn(),
  updateBottle: vi.fn(),
  transaction: vi.fn(),
  upsertWine: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    bottle: {
      findMany: mocks.findManyBottles,
      findUnique: mocks.findUniqueBottle,
      update: mocks.updateBottle,
    },
  },
}))
vi.mock('../providers/heuristics.js', () => ({ enrichWineData: (wine: unknown) => wine }))
vi.mock('../services/search.js', () => ({ searchBottles: vi.fn() }))
vi.mock('../services/serialize.js', () => ({ serializeBottle: (bottle: unknown) => bottle }))
vi.mock('../services/wines.js', () => ({
  drinkingWindow: vi.fn(),
  upsertWine: mocks.upsertWine,
}))

import bottleRoutes from './bottles.js'

interface TestSlot {
  id: string
  number: number
  bottles: { id: string }[]
}

interface TestBottleData {
  wineId: string
  slotId: string
  personalNote: string | null
  purchasePrice: number | null
  labelPhotoPath: string | null
}

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>

async function routeHandler(
  method: 'post' | 'get' | 'patch' | 'delete',
  path: string,
): Promise<RouteHandler> {
  const handlers = {
    post: new Map<string, RouteHandler>(),
    get: new Map<string, RouteHandler>(),
    patch: new Map<string, RouteHandler>(),
    delete: new Map<string, RouteHandler>(),
  }
  const register = (target: Map<string, RouteHandler>) =>
    (registeredPath: string, optionsOrHandler: unknown, handler?: unknown) => {
      const routeHandler = typeof optionsOrHandler === 'function' ? optionsOrHandler : handler
      target.set(registeredPath, routeHandler as RouteHandler)
    }
  const app = {
    authenticate: vi.fn(),
    addHook: vi.fn(),
    post: vi.fn(register(handlers.post)),
    get: vi.fn(register(handlers.get)),
    patch: vi.fn(register(handlers.patch)),
    delete: vi.fn(register(handlers.delete)),
  } as unknown as FastifyInstance

  await bottleRoutes(app)
  return handlers[method].get(path)!
}

async function createHandler(): Promise<RouteHandler> {
  return routeHandler('post', '/')
}

function createReply() {
  let status = 200
  const reply = {
    code: vi.fn((nextStatus: number) => {
      status = nextStatus
      return reply
    }),
    send: vi.fn((payload: unknown) => payload),
  }
  return { reply, get status() { return status } }
}

function request(body: Record<string, unknown>) {
  return { body, currentUser: { id: 'user-1' } }
}

const wine = { name: 'Carton de Bordeaux', source: 'MANUAL' }

describe('POST /api/bottles — ajout en lot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        slot: { findMany: mocks.findManySlots },
        bottle: { createMany: mocks.createManyBottles, findMany: mocks.findManyBottles },
      }),
    )
    mocks.upsertWine.mockResolvedValue('wine-1')
    mocks.createManyBottles.mockImplementation(({ data }: { data: TestBottleData[] }) => {
      mocks.findManyBottles.mockResolvedValue(
        data.map((bottle) => ({ id: `bottle-${bottle.slotId}`, ...bottle })).reverse(),
      )
      return { count: data.length }
    })
  })

  it('crée un exemplaire par emplacement avec une seule fiche vin', async () => {
    const slots: TestSlot[] = [12, 14, 15].map((number) => ({
      id: `slot-${number}`,
      number,
      bottles: [],
    }))
    mocks.findManySlots.mockResolvedValue(slots)
    const handler = await createHandler()
    const response = createReply()

    const result = await handler(
      request({
        wine,
        rackId: 'rack-1',
        slotNumbers: [12, 14, 15],
        personalNote: 'Même carton',
        purchasePrice: 18,
        labelPhotoPath: '/labels/carton.jpg',
      }),
      response.reply,
    )

    expect(response.status).toBe(201)
    expect(mocks.upsertWine).toHaveBeenCalledTimes(1)
    expect(mocks.upsertWine).toHaveBeenCalledWith(
      expect.objectContaining(wine),
      expect.objectContaining({ bottle: expect.anything() }),
    )
    expect(mocks.createManyBottles).toHaveBeenCalledTimes(1)
    expect(
      mocks.createManyBottles.mock.calls[0]?.[0].data.map(
        (input: TestBottleData) => input.slotId,
      ),
    ).toEqual(['slot-12', 'slot-14', 'slot-15'])
    for (const input of mocks.createManyBottles.mock.calls[0]?.[0].data as TestBottleData[]) {
      expect(input).toMatchObject({
        wineId: 'wine-1',
        personalNote: 'Même carton',
        purchasePrice: 18,
        labelPhotoPath: '/labels/carton.jpg',
      })
    }
    expect(result).toMatchObject({
      bottle: { id: 'bottle-slot-12', wineId: 'wine-1' },
      bottles: [
        { id: 'bottle-slot-12', wineId: 'wine-1' },
        { id: 'bottle-slot-14', wineId: 'wine-1' },
        { id: 'bottle-slot-15', wineId: 'wine-1' },
      ],
    })
  })

  it('préserve le contrat unitaire slotNumber et la réponse bottle', async () => {
    mocks.findManySlots.mockResolvedValue([{ id: 'slot-12', number: 12, bottles: [] }])
    const handler = await createHandler()
    const response = createReply()

    const result = await handler(
      request({ wine, rackId: 'rack-1', slotNumber: 12 }),
      response.reply,
    )

    expect(response.status).toBe(201)
    expect(result).toMatchObject({
      bottle: { id: 'bottle-slot-12' },
      bottles: [{ id: 'bottle-slot-12' }],
    })
  })

  it('ne crée rien si un emplacement est absent et retourne les numéros concernés', async () => {
    mocks.findManySlots.mockResolvedValue([{ id: 'slot-12', number: 12, bottles: [] }])
    const handler = await createHandler()
    const response = createReply()

    const result = await handler(
      request({ wine, rackId: 'rack-1', slotNumbers: [12, 14] }),
      response.reply,
    )

    expect(response.status).toBe(400)
    expect(mocks.upsertWine).not.toHaveBeenCalled()
    expect(mocks.createManyBottles).not.toHaveBeenCalled()
    expect(result).toMatchObject({ slotNumbers: [14], missingSlotNumbers: [14] })
  })

  it('ne crée rien si un emplacement est occupé', async () => {
    mocks.findManySlots.mockResolvedValue([
      { id: 'slot-12', number: 12, bottles: [] },
      { id: 'slot-14', number: 14, bottles: [{ id: 'existing' }] },
    ])
    const handler = await createHandler()
    const response = createReply()

    const result = await handler(
      request({ wine, rackId: 'rack-1', slotNumbers: [12, 14] }),
      response.reply,
    )

    expect(response.status).toBe(409)
    expect(mocks.upsertWine).not.toHaveBeenCalled()
    expect(mocks.createManyBottles).not.toHaveBeenCalled()
    expect(result).toMatchObject({ slotNumbers: [14], occupiedSlotNumbers: [14] })
  })

  it('retourne ensemble les emplacements absents et occupés sans rien créer', async () => {
    mocks.findManySlots.mockResolvedValue([
      { id: 'slot-12', number: 12, bottles: [{ id: 'existing' }] },
    ])
    const handler = await createHandler()
    const response = createReply()

    const result = await handler(
      request({ wine, rackId: 'rack-1', slotNumbers: [12, 14] }),
      response.reply,
    )

    expect(response.status).toBe(400)
    expect(mocks.upsertWine).not.toHaveBeenCalled()
    expect(mocks.createManyBottles).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      slotNumbers: [12, 14],
      missingSlotNumbers: [14],
      occupiedSlotNumbers: [12],
    })
    expect(result.error).toContain('14')
    expect(result.error).toContain('12')
  })

  it('laisse remonter une erreur de création pour que Prisma annule toute la transaction', async () => {
    mocks.findManySlots.mockResolvedValue([{ id: 'slot-12', number: 12, bottles: [] }])
    mocks.createManyBottles.mockRejectedValue(new Error('Échec d’écriture'))
    const handler = await createHandler()
    const response = createReply()

    await expect(
      handler(request({ wine, rackId: 'rack-1', slotNumber: 12 }), response.reply),
    ).rejects.toThrow('Échec d’écriture')
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/bottles/:id — exemplaires actifs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renvoie tous les exemplaires actifs du même vin dans l’ordre des casiers et slots', async () => {
    const wineRow = { id: 'wine-1', structure: '{}', foodTags: [] }
    const date = new Date('2025-01-01T00:00:00.000Z')
    const target = { id: 'bottle-16', wineId: 'wine-1', status: 'IN_CELLAR', wine: wineRow }
    mocks.findUniqueBottle.mockResolvedValue(target)
    mocks.findManyBottles.mockResolvedValue([
      {
        id: 'bottle-2',
        wineId: 'wine-1',
        status: 'IN_CELLAR',
        wine: wineRow,
        slot: {
          number: 2,
          rack: { position: 1, createdAt: date },
        },
      },
      {
        id: 'bottle-missing',
        wineId: 'wine-1',
        status: 'IN_CELLAR',
        wine: wineRow,
        slot: null,
      },
      {
        id: 'bottle-16',
        wineId: 'wine-1',
        status: 'IN_CELLAR',
        wine: wineRow,
        slot: {
          number: 16,
          rack: { position: 0, createdAt: date },
        },
      },
      {
        id: 'bottle-15',
        wineId: 'wine-1',
        status: 'IN_CELLAR',
        wine: wineRow,
        slot: {
          number: 15,
          rack: { position: 0, createdAt: date },
        },
      },
    ])
    const handler = await routeHandler('get', '/:id')
    const response = createReply()

    const result = (await handler({ params: { id: 'bottle-16' } }, response.reply)) as {
      activeBottles: { id: string }[]
    }

    expect(mocks.findManyBottles).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wineId: 'wine-1', status: 'IN_CELLAR' } }),
    )
    expect(result.activeBottles.map((bottle) => bottle.id)).toEqual([
      'bottle-15',
      'bottle-16',
      'bottle-2',
      'bottle-missing',
    ])
  })

  it('renvoie 404 sans chercher les exemplaires si la bouteille cible est absente', async () => {
    mocks.findUniqueBottle.mockResolvedValue(null)
    const handler = await routeHandler('get', '/:id')
    const response = createReply()

    const result = await handler({ params: { id: 'missing' } }, response.reply)

    expect(response.status).toBe(404)
    expect(result).toEqual({ error: 'Bouteille introuvable' })
    expect(mocks.findManyBottles).not.toHaveBeenCalled()
  })
})

describe('POST /api/bottles/drink — ouverture atomique', () => {
  const slot = (number: number, rackName = 'Cave principale') => ({
    id: `slot-${number}`,
    number,
    rackId: 'rack-1',
    rack: { name: rackName },
  })
  const activeBottle = (id: string, number: number, wineId = 'wine-1') => ({
    id,
    wineId,
    status: 'IN_CELLAR',
    slotId: `slot-${number}`,
    slot: slot(number),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        bottle: {
          findMany: mocks.findManyBottles,
          updateMany: mocks.updateManyBottles,
        },
      }),
    )
    mocks.updateManyBottles.mockResolvedValue({ count: 2 })
  })

  it('ouvre tous les exemplaires du même vin et mémorise leurs emplacements avant détachement', async () => {
    const before = [activeBottle('bottle-15', 15), activeBottle('bottle-17', 17)]
    const after = before.map((bottle) => ({ ...bottle, status: 'DRUNK', slotId: null, slot: null }))
    mocks.findManyBottles.mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    const handler = await routeHandler('post', '/drink')
    const response = createReply()

    const result = await handler(
      request({
        bottleIds: ['bottle-15', 'bottle-17'],
        personalRating: 4,
        personalNote: 'Très bien',
      }),
      response.reply,
    )

    expect(mocks.updateManyBottles).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: 'bottle-15', slotId: 'slot-15' },
          { id: 'bottle-17', slotId: 'slot-17' },
        ],
        status: 'IN_CELLAR',
        wineId: 'wine-1',
      },
      data: expect.objectContaining({
        status: 'DRUNK',
        slotId: null,
        personalRating: 4,
        personalNote: 'Très bien',
      }),
    })
    expect(result).toMatchObject({
      bottles: [{ id: 'bottle-15' }, { id: 'bottle-17' }],
      freedSlots: [
        { bottleId: 'bottle-15', slotNumber: 15, rackId: 'rack-1', rackName: 'Cave principale' },
        { bottleId: 'bottle-17', slotNumber: 17, rackId: 'rack-1', rackName: 'Cave principale' },
      ],
    })
  })

  it.each([
    {
      label: 'un identifiant absent',
      bottles: [activeBottle('bottle-15', 15)],
      ids: ['bottle-15', 'missing'],
    },
    {
      label: 'deux vins différents',
      bottles: [activeBottle('bottle-15', 15), activeBottle('bottle-17', 17, 'wine-2')],
      ids: ['bottle-15', 'bottle-17'],
    },
    {
      label: 'une bouteille déjà bue',
      bottles: [
        activeBottle('bottle-15', 15),
        { ...activeBottle('bottle-17', 17), status: 'DRUNK' },
      ],
      ids: ['bottle-15', 'bottle-17'],
    },
  ])('répond 409 sans écrire pour $label', async ({ bottles, ids }) => {
    mocks.findManyBottles.mockResolvedValue(bottles)
    const handler = await routeHandler('post', '/drink')
    const response = createReply()

    const result = await handler(request({ bottleIds: ids }), response.reply)

    expect(response.status).toBe(409)
    expect(mocks.updateManyBottles).not.toHaveBeenCalled()
    expect(result).toMatchObject({ bottleIds: ids })
  })

  it('annule la transaction si le nombre de lignes modifiées révèle un conflit concurrent', async () => {
    mocks.findManyBottles.mockResolvedValue([
      activeBottle('bottle-15', 15),
      activeBottle('bottle-17', 17),
    ])
    mocks.updateManyBottles.mockResolvedValue({ count: 1 })
    const handler = await routeHandler('post', '/drink')
    const response = createReply()

    const result = await handler(
      request({ bottleIds: ['bottle-15', 'bottle-17'] }),
      response.reply,
    )

    expect(response.status).toBe(409)
    expect(result).toMatchObject({ bottleIds: ['bottle-15', 'bottle-17'] })
  })

  it('copie aussi un commentaire commun vide sur tous les exemplaires', async () => {
    const before = [activeBottle('bottle-15', 15), activeBottle('bottle-17', 17)]
    const after = before.map((bottle) => ({ ...bottle, status: 'DRUNK', slotId: null, slot: null }))
    mocks.findManyBottles.mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    const handler = await routeHandler('post', '/drink')
    const response = createReply()

    await handler(request({ bottleIds: ['bottle-15', 'bottle-17'], personalNote: null }), response.reply)

    expect(mocks.updateManyBottles).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personalNote: null }) }),
    )
  })

  it('conserve l’endpoint unitaire historique et sa forme de réponse', async () => {
    const before = activeBottle('bottle-15', 15)
    const after = { ...before, status: 'DRUNK', slotId: null, slot: null }
    mocks.findManyBottles.mockResolvedValueOnce([before]).mockResolvedValueOnce([after])
    mocks.updateManyBottles.mockResolvedValue({ count: 1 })
    const handler = await routeHandler('post', '/:id/drink')
    const response = createReply()

    const result = await handler(
      { params: { id: 'bottle-15' }, body: { personalRating: 5 } },
      response.reply,
    )

    expect(result).toMatchObject({ bottle: { id: 'bottle-15', status: 'DRUNK' } })
  })
})

describe('PATCH /api/bottles/:id — dégustation différée', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('permet d’effacer la note et le commentaire d’une bouteille bue', async () => {
    mocks.findUniqueBottle.mockResolvedValue({
      id: 'bottle-15',
      status: 'DRUNK',
      slotId: null,
      slot: null,
    })
    mocks.updateBottle.mockResolvedValue({
      id: 'bottle-15',
      status: 'DRUNK',
      personalRating: null,
      personalNote: null,
    })
    const handler = await routeHandler('patch', '/:id')
    const response = createReply()

    const result = await handler(
      { params: { id: 'bottle-15' }, body: { personalRating: null, personalNote: null } },
      response.reply,
    )

    expect(mocks.updateBottle).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bottle-15' },
        data: expect.objectContaining({ personalRating: null, personalNote: null }),
      }),
    )
    expect(result).toMatchObject({
      bottle: { id: 'bottle-15', personalRating: null, personalNote: null },
    })
  })

  it('refuse de noter par PATCH une bouteille qui est encore en cave', async () => {
    mocks.findUniqueBottle.mockResolvedValue({
      id: 'bottle-15',
      status: 'IN_CELLAR',
      slotId: 'slot-15',
      slot: { rackId: 'rack-1', number: 15 },
    })
    const handler = await routeHandler('patch', '/:id')
    const response = createReply()

    const result = await handler(
      { params: { id: 'bottle-15' }, body: { personalRating: 4 } },
      response.reply,
    )

    expect(response.status).toBe(409)
    expect(mocks.updateBottle).not.toHaveBeenCalled()
    expect(result).toMatchObject({ error: expect.stringContaining('après ouverture') })
  })
})
