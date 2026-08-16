import type { BottleView } from './types'

export const LIST_SORTS = ['slot', 'name', 'rating', 'vintage'] as const

export type ListSort = (typeof LIST_SORTS)[number]
export type SortDirection = 'asc' | 'desc'

export const DEFAULT_SORT_DIRECTIONS: Record<ListSort, SortDirection> = {
  slot: 'asc',
  name: 'asc',
  rating: 'desc',
  vintage: 'desc',
}

function nullableNumber(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return null
}

/**
 * Compare deux bouteilles en laissant toujours les données manquantes à la fin.
 * Le numéro, puis l'identifiant, servent de départage stable : l'ordre ne saute pas
 * quand deux vins ont la même note ou le même millésime.
 */
export function compareBottles(
  a: BottleView,
  b: BottleView,
  sort: ListSort,
  direction: SortDirection,
): number {
  let compared = 0

  if (sort === 'name') {
    compared = a.wine.name.localeCompare(b.wine.name, 'fr', { sensitivity: 'base' })
  } else {
    const left =
      sort === 'slot'
        ? a.slotNumber
        : sort === 'rating'
          ? a.wine.vivinoRating
          : a.wine.vintage
    const right =
      sort === 'slot'
        ? b.slotNumber
        : sort === 'rating'
          ? b.wine.vivinoRating
          : b.wine.vintage
    const missing = nullableNumber(left, right)
    if (missing !== null && missing !== 0) return missing
    compared = (left ?? 0) - (right ?? 0)
  }

  if (compared !== 0) return direction === 'asc' ? compared : -compared

  const slotMissing = nullableNumber(a.slotNumber, b.slotNumber)
  if (slotMissing !== null && slotMissing !== 0) return slotMissing
  const bySlot = (a.slotNumber ?? 0) - (b.slotNumber ?? 0)
  return bySlot || a.id.localeCompare(b.id)
}
