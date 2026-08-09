/**
 * Client HTTP de l'application.
 *
 * L'access token est court (15 min) et gardé en mémoire ; le refresh token vit dans un
 * cookie httpOnly. Sur un 401, on tente un refresh transparent puis on rejoue la requête
 * une seule fois — sans quoi l'utilisateur serait déconnecté toutes les quinze minutes.
 */

let accessToken: string | null = null
let refreshPromise: Promise<boolean> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function refreshSession(): Promise<boolean> {
  // Plusieurs requêtes peuvent échouer en même temps : un seul refresh doit partir.
  refreshPromise ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      if (!res.ok) return false
      const data = (await res.json()) as { accessToken: string }
      accessToken = data.accessToken
      return true
    } catch {
      return false
    } finally {
      // Libéré au tick suivant pour que les appels concurrents partagent bien ce résultat.
      queueMicrotask(() => {
        refreshPromise = null
      })
    }
  })()

  return refreshPromise
}

interface RequestOptions {
  method?: string
  body?: unknown
  retry?: boolean
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retry = true, signal } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && retry) {
    if (await refreshSession()) {
      return request<T>(path, { ...options, retry: false })
    }
    accessToken = null
    throw new ApiError(401, 'Session expirée')
  }

  if (res.status === 204) return undefined as T

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `Erreur ${res.status}`
    throw new ApiError(res.status, message, payload)
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
