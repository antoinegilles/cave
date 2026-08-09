/**
 * Décide si une requête mérite un appel au sommelier IA.
 *
 * Principe : la recherche SQL répond TOUJOURS, instantanément et gratuitement.
 * L'IA n'intervient qu'en supplément, quand la phrase ressemble à une vraie question
 * de sommelier — et jamais sans que l'utilisateur ait validé.
 *
 * Le quota étant de 3 par jour, une détection trop généreuse le viderait en quelques
 * frappes. D'où des conditions strictes et un test dédié pour chacune.
 */

export type SearchMode = 'sql' | 'ai'

export interface IntentContext {
  /** L'utilisateur a validé (Entrée ou bouton) — jamais vrai pendant la frappe. */
  submitted: boolean
  /** Flag serveur actif ET clé Gemini configurée. */
  aiAvailable: boolean
  /** Crédits restants aujourd'hui. */
  quotaRemaining: number
  /** L'utilisateur a explicitement demandé à rester en recherche classique. */
  forceSql?: boolean
}

export interface IntentDecision {
  mode: SearchMode
  /** Pourquoi l'IA n'a pas été sollicitée — sert à afficher le bon message. */
  reason: 'natural-language' | 'too-short' | 'not-submitted' | 'no-quota' | 'unavailable' | 'forced'
}

/** Amorces qui trahissent une question adressée à un sommelier plutôt qu'un mot-clé. */
const CONVERSATIONAL_MARKERS = [
  'que', 'quel', 'quelle', 'quoi', 'qu est', 'qu est ce',
  'je fais', 'je prepare', 'je cuisine', 'je mange', 'je recois', 'je sers',
  'avec quoi', 'pour aller', 'pour accompagner', 'accompagner',
  'conseille', 'conseil', 'suggere', 'recommande', 'propose',
  'on mange', 'on fait', 'ce soir', 'ce midi', 'demain',
  'qu est ce qui', 'lequel', 'laquelle', 'aide moi',
]

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9?]+/g, ' ')
    .trim()
}

/** Nombre de mots signifiants — les articles ne comptent pas comme de la complexité. */
const STOP_WORDS = new Set(['un', 'une', 'le', 'la', 'les', 'de', 'du', 'des', 'd', 'l', 'et', 'a'])

export function countMeaningfulWords(query: string): number {
  return normalize(query)
    .split(' ')
    .filter((w) => w.length > 0 && w !== '?' && !STOP_WORDS.has(w)).length
}

/**
 * Vrai si la requête ressemble à du langage naturel plutôt qu'à un mot-clé.
 *
 * « poisson » ou « chateau margaux » → non : la recherche SQL les traite parfaitement.
 * « je fais un gigot pour six » → oui : aucune requête SQL ne saura répondre à ça.
 */
export function looksConversational(query: string): boolean {
  const normalized = normalize(query)
  if (!normalized) return false

  if (normalized.includes('?')) return true

  for (const marker of CONVERSATIONAL_MARKERS) {
    // Comparaison ancrée sur des mots entiers pour éviter « quel » dans « quelconque ».
    const pattern = new RegExp(`(^| )${marker.replace(/ /g, ' ')}( |$)`)
    if (pattern.test(normalized)) return true
  }

  return countMeaningfulWords(query) >= 4
}

export function decideSearchMode(query: string, context: IntentContext): IntentDecision {
  // Ordre volontaire : on écarte d'abord tout ce qui interdit l'IA, pour que le message
  // affiché à l'utilisateur désigne la vraie raison.
  if (context.forceSql) return { mode: 'sql', reason: 'forced' }
  if (!context.submitted) return { mode: 'sql', reason: 'not-submitted' }
  if (!context.aiAvailable) return { mode: 'sql', reason: 'unavailable' }
  if (!looksConversational(query)) return { mode: 'sql', reason: 'too-short' }
  if (context.quotaRemaining <= 0) return { mode: 'sql', reason: 'no-quota' }

  return { mode: 'ai', reason: 'natural-language' }
}
