import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManyRacks: vi.fn(),
  countRacks: vi.fn(),
  createRack: vi.fn(),
  findManyBottles: vi.fn(),
  countBottles: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    rack: {
      findMany: mocks.findManyRacks,
      count: mocks.countRacks,
      create: mocks.createRack,
    },
    bottle: {
      findMany: mocks.findManyBottles,
      count: mocks.countBottles,
    },
  },
}))
vi.mock('../services/serialize.js', () => ({ serializeBottle: (bottle: unknown) => bottle }))
vi.mock('../services/wines.js', () => ({ drinkingWindow: vi.fn(() => null) }))

import rackRoutes from './racks.js'
import statsRoutes from './stats.js'

type Handler = (request: unknown, reply: unknown) => Promise<unknown>

async function handlersFor(registerRoutes: (app: FastifyInstance) => Promise<void>) {
  const handlers = new Map<string, Handler>()
  const app = {
    authenticate: vi.fn(),
    addHook: vi.fn(),
    get: vi.fn((path: string, handler: Handler) => handlers.set(`GET ${path}`, handler)),
    post: vi.fn((path: string, handler: Handler) => handlers.set(`POST ${path}`, handler)),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as FastifyInstance
  await registerRoutes(app)
  return handlers
}

function request(role: 'USER' | 'ADMIN' = 'USER', asUser?: string) {
  return {
    currentUser: { id: 'user-self', role },
    query: asUser ? { asUser } : {},
  }
}

function reply() {
  const target = { code: vi.fn(() => target), send: vi.fn((value: unknown) => value) }
  return target
}

describe('isolation des caves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findManyRacks.mockResolvedValue([])
    mocks.findManyBottles.mockResolvedValue([])
    mocks.countBottles.mockResolvedValue(0)
    mocks.countRacks.mockResolvedValue(0)
    mocks.createRack.mockResolvedValue({ id: 'rack-new', name: 'Personnel' })
  })

  it('filtre les casiers sur soi-même ou sur la cible administrateur', async () => {
    const handlers = await handlersFor(rackRoutes)
    const handler = handlers.get('GET /')!

    await handler(request(), reply())
    expect(mocks.findManyRacks).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { ownerId: 'user-self' } }),
    )

    await handler(request('ADMIN', 'user-other'), reply())
    expect(mocks.findManyRacks).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { ownerId: 'user-other' } }),
    )
    expect(mocks.findManyRacks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          slots: expect.objectContaining({
            include: expect.objectContaining({
              bottles: expect.objectContaining({
                where: { status: 'IN_CELLAR', ownerId: 'user-other' },
              }),
            }),
          }),
        }),
      }),
    )
  })

  it('renvoie les bouteilles sans emplacement séparément des casiers, isolées par propriétaire', async () => {
    const handler = (await handlersFor(rackRoutes)).get('GET /')!
    const unplacedBottle = { id: 'bottle-loose', slotId: null }
    mocks.findManyBottles.mockResolvedValue([unplacedBottle])

    const result = (await handler(request(), reply())) as { unplaced: unknown[] }
    expect(mocks.findManyBottles).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { status: 'IN_CELLAR', ownerId: 'user-self', slotId: null },
      }),
    )
    expect(result.unplaced).toEqual([unplacedBottle])

    await handler(request('ADMIN', 'user-other'), reply())
    expect(mocks.findManyBottles).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { status: 'IN_CELLAR', ownerId: 'user-other', slotId: null },
      }),
    )
  })

  it('refuse asUser à un compte normal avant toute requête', async () => {
    const handler = (await handlersFor(rackRoutes)).get('GET /')!
    await expect(handler(request('USER', 'user-other'), reply())).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mocks.findManyRacks).not.toHaveBeenCalled()
  })

  it('ignore asUser lors de la création d’un casier', async () => {
    const handler = (await handlersFor(rackRoutes)).get('POST /')!
    await handler(
      {
        ...request('ADMIN', 'user-other'),
        body: { name: 'Personnel', firstNumber: 1, lastNumber: 4 },
      },
      reply(),
    )
    expect(mocks.createRack).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: 'user-self' }) }),
    )
  })

  it('filtre statistiques actives et historique sur le propriétaire visé', async () => {
    const handlers = await handlersFor(statsRoutes)
    await handlers.get('GET /')!(request('ADMIN', 'user-other'), reply())
    expect(mocks.findManyBottles).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'IN_CELLAR', ownerId: 'user-other' } }),
    )
    expect(mocks.countBottles).toHaveBeenCalledWith({
      where: { status: 'DRUNK', ownerId: 'user-other' },
    })

    await handlers.get('GET /history')!(request('ADMIN', 'user-other'), reply())
    expect(mocks.findManyBottles).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { status: 'DRUNK', ownerId: 'user-other' } }),
    )
  })
})
