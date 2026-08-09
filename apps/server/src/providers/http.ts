import { prisma } from '../lib/prisma.js'

/**
 * Fetch mutualisé pour les providers externes : sérialise les appels, respecte un délai
 * minimum entre deux requêtes vers un même hôte, et met en cache les réponses réussies.
 *
 * Le cache est permanent par défaut : une fiche vin ne bouge quasiment jamais, et c'est ce
 * qui garantit qu'on ne refrappe pas Vivino à chaque affichage de la cave.
 */

const lastCallByHost = new Map<string, number>()
const queueByHost = new Map<string, Promise<unknown>>()

async function throttle(host: string, minIntervalMs: number): Promise<void> {
  const last = lastCallByHost.get(host) ?? 0
  const wait = last + minIntervalMs - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallByHost.set(host, Date.now())
}

export interface FetchOptions {
  minIntervalMs?: number
  timeoutMs?: number
  headers?: Record<string, string>
  /** Durée de validité du cache. `Infinity` (défaut) = cache permanent. */
  maxAgeMs?: number
  /** Ignore le cache en lecture (utile pour rafraîchir une fiche à la demande). */
  bypassCache?: boolean
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export async function fetchWithCache(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    minIntervalMs = 1000,
    timeoutMs = 15_000,
    headers = {},
    maxAgeMs = Number.POSITIVE_INFINITY,
    bypassCache = false,
  } = options

  if (!bypassCache) {
    const cached = await prisma.scrapeCache.findUnique({ where: { url } })
    if (cached && Date.now() - cached.fetchedAt.getTime() < maxAgeMs) {
      return cached.payload
    }
  }

  const host = new URL(url).host

  // Chaîne les appels par hôte : deux ajouts de bouteille simultanés ne doivent pas
  // déclencher deux requêtes Vivino en parallèle et court-circuiter le throttling.
  const previous = queueByHost.get(host) ?? Promise.resolve()
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      await throttle(host, minIntervalMs)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(url, {
          headers,
          signal: controller.signal,
          redirect: 'follow',
        })
        const body = await res.text()

        if (!res.ok) throw new HttpError(res.status, `${res.status} sur ${url}`)

        await prisma.scrapeCache.upsert({
          where: { url },
          create: { url, payload: body, status: res.status },
          update: { payload: body, status: res.status, fetchedAt: new Date() },
        })
        return body
      } finally {
        clearTimeout(timer)
      }
    })

  queueByHost.set(host, task)
  return task as Promise<string>
}

/**
 * Coupe-circuit : après N échecs consécutifs (403/429/timeout), on arrête d'appeler le
 * provider pendant `cooldownMs` et la chaîne bascule sur le fallback. Sans ça, une IP
 * bloquée par Vivino se traduirait par un ajout de bouteille lent et cassé à chaque fois.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt: number | null = null

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 3_600_000,
  ) {}

  get isOpen(): boolean {
    if (this.openedAt === null) return false
    if (Date.now() - this.openedAt > this.cooldownMs) {
      this.reset()
      return false
    }
    return true
  }

  get status() {
    return {
      open: this.isOpen,
      failures: this.failures,
      retryAt: this.openedAt ? new Date(this.openedAt + this.cooldownMs).toISOString() : null,
    }
  }

  recordSuccess(): void {
    this.reset()
  }

  recordFailure(): void {
    this.failures += 1
    if (this.failures >= this.threshold) this.openedAt = Date.now()
  }

  reset(): void {
    this.failures = 0
    this.openedAt = null
  }
}
