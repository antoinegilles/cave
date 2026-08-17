import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  setAccessToken: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: { post: mocks.post },
  setAccessToken: mocks.setAccessToken,
  setSessionExpiredHandler: mocks.setSessionExpiredHandler,
  isNetworkError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { kind?: string }).kind === 'network'),
  isUnauthorizedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { status?: number }).status === 401),
}))

import { useAuthStore } from './auth'

const cachedUser = {
  id: 'user-1',
  email: 'user@example.test',
  name: 'Antoine',
  role: 'ADMIN',
}

function storageStub() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() {
      return values.size
    },
  }
}

describe('session hors connexion', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.post.mockReset()
    mocks.setAccessToken.mockReset()
    mocks.setSessionExpiredHandler.mockReset()
    vi.stubGlobal('localStorage', storageStub())
  })

  it('conserve seulement le profil minimal pendant une panne réseau', async () => {
    localStorage.setItem('cave-last-user', JSON.stringify(cachedUser))
    mocks.post.mockRejectedValue({ kind: 'network' })
    const auth = useAuthStore()

    await auth.restore()

    expect(auth.user).toEqual(cachedUser)
    expect(auth.sessionNeedsValidation).toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(mocks.setAccessToken).not.toHaveBeenCalledWith(null)
  })

  it('efface le profil lorsqu’un vrai 401 confirme l’expiration', async () => {
    localStorage.setItem('cave-last-user', JSON.stringify(cachedUser))
    mocks.post.mockRejectedValue({ status: 401 })
    const auth = useAuthStore()

    await auth.restore()

    expect(auth.user).toBeNull()
    expect(localStorage.getItem('cave-last-user')).toBeNull()
    expect(mocks.setAccessToken).toHaveBeenCalledWith(null)
  })

  it('revalide le profil au retour du serveur', async () => {
    localStorage.setItem('cave-last-user', JSON.stringify(cachedUser))
    mocks.post.mockRejectedValueOnce({ kind: 'network' }).mockResolvedValueOnce({
      accessToken: 'token-neuf',
      user: { ...cachedUser, name: 'Antoine connecté' },
    })
    const auth = useAuthStore()
    await auth.restore()

    await auth.revalidate()

    expect(auth.user?.name).toBe('Antoine connecté')
    expect(auth.sessionNeedsValidation).toBe(false)
    expect(mocks.setAccessToken).toHaveBeenCalledWith('token-neuf')
  })

  it('branche l’expiration globale de l’API sur le nettoyage local', () => {
    const auth = useAuthStore()
    auth.user = cachedUser
    localStorage.setItem('cave-last-user', JSON.stringify(cachedUser))
    const handler = mocks.setSessionExpiredHandler.mock.calls[0]?.[0] as () => void

    handler()

    expect(auth.user).toBeNull()
    expect(localStorage.getItem('cave-last-user')).toBeNull()
  })
})
