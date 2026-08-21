import type { EventName } from '@cave/shared'

/**
 * Traçage produit côté client (analytics maison, first-party).
 *
 * On n'envoie que des événements d'**intention/navigation** — les moments autoritaires
 * (inscription réussie, ajout, recherche) sont journalisés côté serveur, infalsifiables. Ici :
 *  - un `anonId` aléatoire (localStorage) qui permet de recoudre le funnel d'inscription ;
 *  - une file mémoire vidée par lots via `sendBeacon`, y compris quand l'onglet se ferme ;
 *  - un interrupteur `setEnabled(false)` pour **exclure les comptes admin** (câblé à l'auth).
 *
 * Rien n'est bloquant : un échec d'envoi est silencieux, jamais dans le chemin d'une action.
 */

const ANON_KEY = 'cave-anon-id'
const ENDPOINT = '/api/events'

interface QueuedEvent {
  name: EventName
  props?: Record<string, string | number | boolean>
  path?: string
}

let queue: QueuedEvent[] = []
let enabled = true
let flushTimer: ReturnType<typeof setTimeout> | null = null

function readAnonId(): string {
  try {
    const existing = localStorage.getItem(ANON_KEY)
    if (existing) return existing
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(ANON_KEY, generated)
    return generated
  } catch {
    // Stockage refusé (mode privé strict) : id éphémère, le traçage reste best-effort.
    return `anon-ephemeral`
  }
}

let anonId = ''

export function getAnonId(): string {
  if (!anonId) anonId = readAnonId()
  return anonId
}

/** Exclusion admin : à false, `track` et les flushs deviennent des no-op. */
export function setAnalyticsEnabled(value: boolean): void {
  enabled = value
  if (!enabled) queue = []
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, 4000)
}

/** Envoie la file en un lot. `sendBeacon` survit à la fermeture de l'onglet ; sinon `fetch`. */
export function flush(): void {
  if (!enabled || queue.length === 0) return
  const events = queue
  queue = []
  const body = JSON.stringify({ anonId: getAnonId(), events })

  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
      if (ok) return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'include',
    }).catch(() => {})
  } catch {
    // Silencieux : le traçage ne doit jamais gêner l'utilisateur.
  }
}

export function track(
  name: EventName,
  props?: Record<string, string | number | boolean>,
  path?: string,
): void {
  if (!enabled) return
  queue.push({ name, ...(props ? { props } : {}), ...(path ? { path } : {}) })
  // Un lot trop gros part tout de suite ; sinon on regroupe.
  if (queue.length >= 20) flush()
  else scheduleFlush()
}

/** À appeler une fois au démarrage : garantit l'anonId et vide la file aux bons moments. */
export function initAnalytics(): void {
  getAnonId()
  if (typeof document !== 'undefined') {
    // `pagehide`/`visibilitychange` : dernière chance d'envoyer avant fermeture ou bascule.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    window.addEventListener('pagehide', flush)
  }
}
