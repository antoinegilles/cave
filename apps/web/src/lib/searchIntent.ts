/** Décide si une validation texte enchaîne le sommelier après la réponse SQL. */

export type SearchMode = 'sql' | 'ai'

export interface IntentContext {
  /** L'utilisateur a validé (Entrée ou bouton) — jamais vrai pendant la frappe. */
  submitted: boolean
  /** La lecture de l'état serveur a abouti. */
  statusAvailable: boolean
  /** États séparés : ne jamais masquer un flag coupé derrière une clé absente. */
  featureEnabled: boolean
  configured: boolean
  /** Crédits restants aujourd'hui. */
  quotaRemaining: number
}

export interface IntentDecision {
  mode: SearchMode
  /** Pourquoi l'IA n'a pas été sollicitée — sert à afficher le bon message. */
  reason:
    | 'eligible-text'
    | 'too-short'
    | 'not-submitted'
    | 'no-quota'
    | 'feature-disabled'
    | 'unconfigured'
    | 'status-error'
}

export function decideSearchMode(query: string, context: IntentContext): IntentDecision {
  if (!context.submitted) return { mode: 'sql', reason: 'not-submitted' }
  if (query.trim().length < 3) return { mode: 'sql', reason: 'too-short' }
  if (!context.statusAvailable) return { mode: 'sql', reason: 'status-error' }
  if (!context.featureEnabled) return { mode: 'sql', reason: 'feature-disabled' }
  if (!context.configured) return { mode: 'sql', reason: 'unconfigured' }
  if (context.quotaRemaining <= 0) return { mode: 'sql', reason: 'no-quota' }

  return { mode: 'ai', reason: 'eligible-text' }
}
