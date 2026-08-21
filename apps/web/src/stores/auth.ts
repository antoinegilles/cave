import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { setAnalyticsEnabled } from '../lib/analytics'
import {
  api,
  isNetworkError,
  isUnauthorizedError,
  setAccessToken,
  setSessionExpiredHandler,
} from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  role: string
}

const CACHED_USER_KEY = 'cave-last-user'

function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return ['id', 'email', 'name', 'role'].every((key) => typeof candidate[key] === 'string')
}

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return isUser(value) ? value : null
  } catch {
    return null
  }
}

function writeCachedUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(CACHED_USER_KEY)
  } catch {
    // Le profil en mémoire reste utilisable lorsque le stockage est refusé.
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)
  const sessionNeedsValidation = ref(false)
  const revalidating = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  function acceptSession(data: { accessToken: string; user: User }): void {
    setAccessToken(data.accessToken)
    user.value = data.user
    sessionNeedsValidation.value = false
    writeCachedUser(data.user)
    // Exclusion admin du traçage (garde côté client ; le serveur l'applique aussi).
    setAnalyticsEnabled(data.user.role !== 'ADMIN')
  }

  function clearSession(): void {
    user.value = null
    sessionNeedsValidation.value = false
    setAccessToken(null)
    writeCachedUser(null)
    // Déconnecté = anonyme : on réactive (funnel d'inscription notamment).
    setAnalyticsEnabled(true)
  }

  async function refreshSession(signal?: AbortSignal): Promise<void> {
    const data = await api.post<{ accessToken: string; user: User }>(
      '/api/auth/refresh',
      undefined,
      signal,
    )
    acceptSession(data)
  }

  /**
   * Restaure la session au chargement à partir du cookie de refresh.
   * Appelé une seule fois avant le premier rendu du routeur.
   */
  async function restore(): Promise<void> {
    const cached = readCachedUser()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      await refreshSession(controller.signal)
    } catch (error) {
      if (isUnauthorizedError(error)) {
        clearSession()
      } else {
        // Panne réseau, serveur indisponible ou délai dépassé : seul le profil minimal est
        // restauré. Il ne contient aucun jeton et toute autorisation reste côté serveur.
        user.value = cached
        sessionNeedsValidation.value = cached !== null
        if (!isNetworkError(error) && !(error instanceof Error && error.name === 'AbortError')) {
          console.warn('Session à revalider lorsque le serveur sera disponible.')
        }
      }
    } finally {
      clearTimeout(timeout)
      ready.value = true
    }
  }

  async function revalidate(): Promise<void> {
    if (!sessionNeedsValidation.value || revalidating.value) return
    revalidating.value = true
    try {
      await refreshSession()
    } catch (error) {
      if (isUnauthorizedError(error)) clearSession()
      // Une nouvelle panne réseau conserve le profil minimal et attend le prochain retour.
    } finally {
      revalidating.value = false
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const data = await api.post<{ accessToken: string; user: User }>('/api/auth/login', {
      email,
      password,
    })
    acceptSession(data)
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout')
    } finally {
      clearSession()
    }
  }

  setSessionExpiredHandler(clearSession)

  return {
    user,
    ready,
    sessionNeedsValidation,
    revalidating,
    isAuthenticated,
    isAdmin,
    restore,
    revalidate,
    login,
    logout,
  }
})
