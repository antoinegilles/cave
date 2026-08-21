import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  eventCreate: vi.fn(),
  config: { ANALYTICS_ENABLED: true },
}))

vi.mock('../lib/prisma.js', () => ({ prisma: { event: { create: mocks.eventCreate } } }))
vi.mock('../config.js', () => ({ config: mocks.config }))

import { logEvent } from '../services/events.js'
import eventRoutes from './events.js'

type Handler = (request: unknown, reply: unknown) => Promise<unknown>

async function eventHandler(): Promise<Handler> {
  const handlers = new Map<string, Handler>()
  const app = {
    addHook: vi.fn(),
    post: vi.fn((path: string, handler: Handler) => handlers.set(`POST ${path}`, handler)),
  } as unknown as FastifyInstance
  await eventRoutes(app)
  return handlers.get('POST /')!
}

/** Faux `req` : `jwtVerify` réussit et pose `user` seulement si un token est fourni. */
function req(opts: { token?: { sub: string; role: string }; body: unknown }) {
  return {
    jwtVerify: async () => {
      if (!opts.token) throw new Error('pas de token')
    },
    user: opts.token,
    body: opts.body,
  }
}

function reply() {
  const target = { code: vi.fn(() => target), send: vi.fn((value?: unknown) => value) }
  return target
}

describe('ingestion des événements (POST /api/events)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.config.ANALYTICS_ENABLED = true
    mocks.eventCreate.mockResolvedValue({})
  })

  it('stampe userId depuis le token quand présent (jamais depuis le corps)', async () => {
    const handler = await eventHandler()
    const r = reply()
    await handler(
      req({
        token: { sub: 'user-1', role: 'USER' },
        body: { anonId: 'ignore-moi', events: [{ name: 'page_view', props: { name: 'cellar' } }] },
      }),
      r,
    )

    expect(mocks.eventCreate).toHaveBeenCalledTimes(1)
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'page_view', userId: 'user-1', anonId: null }),
      }),
    )
    expect(r.code).toHaveBeenCalledWith(204)
  })

  it('utilise l’anonId du corps quand la requête est anonyme', async () => {
    const handler = await eventHandler()
    await handler(
      req({ body: { anonId: 'anon-42', events: [{ name: 'register_submitted' }] } }),
      reply(),
    )

    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'register_submitted', userId: null, anonId: 'anon-42' }),
      }),
    )
  })

  it('n’écrit rien pour un token ADMIN (exclusion admin serveur)', async () => {
    const handler = await eventHandler()
    const r = reply()
    await handler(
      req({ token: { sub: 'admin-1', role: 'ADMIN' }, body: { events: [{ name: 'page_view' }] } }),
      r,
    )

    expect(mocks.eventCreate).not.toHaveBeenCalled()
    expect(r.code).toHaveBeenCalledWith(204)
  })

  it('rejette un nom d’événement hors allowlist', async () => {
    const handler = await eventHandler()
    const r = reply()
    await handler(
      req({ token: { sub: 'user-1', role: 'USER' }, body: { events: [{ name: 'bidon' }] } }),
      r,
    )

    expect(r.code).toHaveBeenCalledWith(400)
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })

  it('ne fait rien quand ANALYTICS_ENABLED est false', async () => {
    mocks.config.ANALYTICS_ENABLED = false
    const handler = await eventHandler()
    const r = reply()
    await handler(
      req({ token: { sub: 'user-1', role: 'USER' }, body: { events: [{ name: 'page_view' }] } }),
      r,
    )

    expect(r.code).toHaveBeenCalledWith(204)
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })
})

describe('logEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.config.ANALYTICS_ENABLED = true
  })

  it('avale une erreur d’écriture sans la propager (jamais bloquant)', async () => {
    mocks.eventCreate.mockRejectedValue(new Error('base indisponible'))
    await expect(logEvent('page_view', { userId: 'user-1' })).resolves.toBeUndefined()
  })

  it('ignore les comptes ADMIN', async () => {
    mocks.eventCreate.mockResolvedValue({})
    await logEvent('page_view', { userId: 'admin-1', userRole: 'ADMIN' })
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })
})
