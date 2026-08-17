/**
 * Client HTTP de l'application.
 *
 * L'access token est court (15 min) et gardé en mémoire ; le refresh token vit dans un
 * cookie httpOnly. Sur un 401, on tente un refresh transparent puis on rejoue la requête
 * une seule fois — sans quoi l'utilisateur serait déconnecté toutes les quinze minutes.
 */

let accessToken: string | null = null
let refreshPromise: Promise<void> | null = null
let sessionExpiredHandler: (() => void) | null = null
let networkStateHandler: ((reachable: boolean) => void) | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

export function setNetworkStateHandler(handler: ((reachable: boolean) => void) | null): void {
  networkStateHandler = handler
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

export class NetworkError extends Error {
  constructor(message = 'Connexion réseau indisponible') {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

function expireSession(): void {
  accessToken = null
  sessionExpiredHandler?.()
}

async function fetchFromNetwork(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init)
    networkStateHandler?.(true)
    return response
  } catch (error) {
    // Une annulation explicite reste une annulation ; elle ne signifie ni panne réseau ni
    // expiration de session.
    if (error instanceof Error && error.name === 'AbortError') throw error
    networkStateHandler?.(false)
    throw new NetworkError()
  }
}

async function responsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

function errorFromResponse(response: Response, payload: unknown): ApiError {
  const message =
    (payload as { error?: string } | null)?.error ?? `Erreur ${response.status}`
  return new ApiError(response.status, message, payload)
}

async function refreshSession(): Promise<void> {
  // Plusieurs requêtes peuvent échouer en même temps : un seul refresh doit partir.
  refreshPromise ??= (async () => {
    try {
      const res = await fetchFromNetwork('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await responsePayload(res)
      if (!res.ok) throw errorFromResponse(res, payload)
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as { accessToken?: unknown }).accessToken !== 'string'
      ) {
        throw new ApiError(502, 'Réponse de session invalide', payload)
      }
      const data = payload as { accessToken: string }
      accessToken = data.accessToken
    } catch (error) {
      if (isUnauthorizedError(error)) expireSession()
      throw error
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

  const res = await fetchFromNetwork(path, {
    method,
    headers,
    credentials: 'include',
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const refreshable = ![
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
  ].includes(path)
  if (res.status === 401 && retry && refreshable) {
    await refreshSession()
    return request<T>(path, { ...options, retry: false })
  }

  if (res.status === 204) return undefined as T

  const payload = await responsePayload(res)

  if (!res.ok) {
    if (res.status === 401) expireSession()
    throw errorFromResponse(res, payload)
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
