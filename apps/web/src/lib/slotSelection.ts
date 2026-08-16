import { MAX_BOTTLES_PER_ADD, MAX_SLOT_NUMBER } from '@cave/shared'

export type SlotSelectionParseResult =
  | { success: true; numbers: number[] }
  | { success: false; error: string }

/**
 * Analyse une saisie telle que `12, 14, 20-27` sans jamais corriger silencieusement
 * un doublon ou une plage ambiguë. Les espaces, virgules, points-virgules et retours à
 * la ligne servent de séparateurs.
 */
export function parseSlotSelection(input: string): SlotSelectionParseResult {
  const normalized = input.trim().replace(/\s*-\s*/g, '-')
  if (!normalized) return { success: false, error: 'Saisis au moins un emplacement.' }
  if (/(^|[,;])\s*([,;]|$)/.test(normalized)) {
    return { success: false, error: 'Sépare chaque emplacement par un seul séparateur.' }
  }

  const tokens = normalized.split(/[\s,;]+/).filter(Boolean)
  if (tokens.length === 0) return { success: false, error: 'Saisis au moins un emplacement.' }

  const seen = new Set<number>()
  const numbers: number[] = []

  function add(number: number): SlotSelectionParseResult | null {
    if (number > MAX_SLOT_NUMBER) {
      return {
        success: false,
        error: `L’emplacement ${number} dépasse le numéro maximum ${MAX_SLOT_NUMBER}.`,
      }
    }
    if (seen.has(number)) {
      return { success: false, error: `L’emplacement ${number} est indiqué plusieurs fois.` }
    }
    if (numbers.length >= MAX_BOTTLES_PER_ADD) {
      return {
        success: false,
        error: `Tu peux sélectionner au maximum ${MAX_BOTTLES_PER_ADD} emplacements.`,
      }
    }

    seen.add(number)
    numbers.push(number)
    return null
  }

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const error = add(Number(token))
      if (error) return error
      continue
    }

    const range = /^(\d+)-(\d+)$/.exec(token)
    if (!range) {
      return {
        success: false,
        error: `« ${token} » n’est pas un numéro ou une plage valide.`,
      }
    }

    const from = Number(range[1])
    const to = Number(range[2])
    if (from > to) {
      return { success: false, error: `La plage ${token} doit aller du plus petit au plus grand.` }
    }
    if (to - from + 1 > MAX_BOTTLES_PER_ADD) {
      return {
        success: false,
        error: `Tu peux sélectionner au maximum ${MAX_BOTTLES_PER_ADD} emplacements.`,
      }
    }

    for (let number = from; number <= to; number += 1) {
      const error = add(number)
      if (error) return error
    }
  }

  return { success: true, numbers: numbers.sort((a, b) => a - b) }
}
