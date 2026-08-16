import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManySlots: vi.fn(),
  createManyBottles: vi.fn(),
  findManyBottles: vi.fn(),
  transaction: vi.fn(),
  upsertWine: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
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

async function createHandler(): Promise<RouteHandler> {
  const handlers = new Map<string, RouteHandler>()
  const register = (path: string, optionsOrHandler: unknown, handler?: unknown) => {
    const routeHandler = typeof optionsOrHandler === 'function' ? optionsOrHandler : handler
    handlers.set(path, routeHandler as RouteHandler)
  }
  const app = {
    authenticate: vi.fn(),
    addHook: vi.fn(),
    post: vi.fn(register),
    get: vi.fn(register),
    patch: vi.fn(register),
    delete: vi.fn(register),
  } as unknown as FastifyInstance

  await bottleRoutes(app)
  return handlers.get('/')!
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
