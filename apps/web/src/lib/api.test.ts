import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('client API — réseau et expiration de session', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('distingue une panne réseau d’une réponse HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const api = await import('./api')

    await expect(api.request('/api/test')).rejects.toBeInstanceOf(api.NetworkError)
  })

  it('ne vide pas la session quand le refresh échoue à cause du réseau', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Jeton expiré' }))
      .mockRejectedValueOnce(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('./api')
    const expired = vi.fn()
    api.setAccessToken('token-existant')
    api.setSessionExpiredHandler(expired)

    await expect(api.request('/api/private')).rejects.toBeInstanceOf(api.NetworkError)

    expect(api.getAccessToken()).toBe('token-existant')
    expect(expired).not.toHaveBeenCalled()
  })

  it('efface la session uniquement quand le serveur confirme un refresh expiré', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { error: 'Jeton expiré' }))
        .mockResolvedValueOnce(jsonResponse(401, { error: 'Session expirée' })),
    )
    const api = await import('./api')
    const expired = vi.fn()
    api.setAccessToken('ancien-token')
    api.setSessionExpiredHandler(expired)

    await expect(api.request('/api/private')).rejects.toMatchObject({
      status: 401,
      message: 'Session expirée',
    })

    expect(api.getAccessToken()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('rejoue la requête avec le nouveau jeton après un refresh réussi', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Jeton expiré' }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'nouveau-token' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('./api')
    api.setAccessToken('ancien-token')

    await expect(api.request<{ ok: boolean }>('/api/private')).resolves.toEqual({ ok: true })

    const replayHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>
    expect(replayHeaders.Authorization).toBe('Bearer nouveau-token')
  })

  it('refuse un refresh 200 malformé sans inventer de jeton ni expirer la session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { error: 'Jeton expiré' }))
        .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-1' } })),
    )
    const api = await import('./api')
    const expired = vi.fn()
    api.setAccessToken('ancien-token')
    api.setSessionExpiredHandler(expired)

    await expect(api.request('/api/private')).rejects.toMatchObject({
      status: 502,
      message: 'Réponse de session invalide',
    })

    expect(api.getAccessToken()).toBe('ancien-token')
    expect(expired).not.toHaveBeenCalled()
  })
})
