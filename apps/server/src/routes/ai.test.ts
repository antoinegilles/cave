import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isSommelierEnabled: vi.fn(),
  remainingQuota: vi.fn(),
  isGeminiConfigured: vi.fn(),
}))

vi.mock('../config.js', () => ({ config: { AI_DAILY_QUOTA: 3 } }))
vi.mock('../services/gemini.js', () => ({
  GeminiError: class GeminiError extends Error {},
  isGeminiConfigured: mocks.isGeminiConfigured,
}))
vi.mock('../services/sommelier.js', () => ({
  QuotaExceededError: class QuotaExceededError extends Error {},
  askSommelier: vi.fn(),
  isSommelierEnabled: mocks.isSommelierEnabled,
  remainingQuota: mocks.remainingQuota,
}))

import aiRoutes from './ai.js'

async function statusHandler() {
  let handler: ((request: unknown) => Promise<unknown>) | undefined
  const app = {
    authenticate: vi.fn(),
    addHook: vi.fn(),
    get: vi.fn((path: string, registered: typeof handler) => {
      if (path === '/sommelier/status') handler = registered
    }),
    post: vi.fn(),
  } as unknown as FastifyInstance

  await aiRoutes(app)
  return handler!
}

describe('GET /api/ai/sommelier/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('expose séparément le flag, la configuration et le quota', async () => {
    mocks.isSommelierEnabled.mockResolvedValue(false)
    mocks.isGeminiConfigured.mockReturnValue(false)
    mocks.remainingQuota.mockResolvedValue(2)
    const handler = await statusHandler()

    await expect(handler({ currentUser: { id: 'user-1' } })).resolves.toEqual({
      featureEnabled: false,
      configured: false,
      dailyQuota: 3,
      remaining: 2,
      maxPromptLength: 250,
    })
    expect(mocks.remainingQuota).toHaveBeenCalledWith('user-1')
  })
})
