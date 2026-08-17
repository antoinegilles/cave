import type { BottleView } from './types'

export interface BottleGroup {
  wineId: string
  representative: BottleView
  bottles: BottleView[]
  count: number
  highlighted: boolean
}

/**
 * Compare les positions physiques telles qu'elles apparaissent dans la cave : ordre des
 * casiers, numéro d'emplacement, puis identifiant stable. Les exemplaires sans position
 * restent visibles mais passent après les bouteilles réellement rangées.
 */
export function compareBottleLocations(
  a: BottleView,
  b: BottleView,
  rackOrder: readonly string[],
): number {
  const ranks = new Map(rackOrder.map((rackId, index) => [rackId, index]))
  const missingRank = rackOrder.length
  const leftRank = a.rackId === null ? missingRank + 1 : (ranks.get(a.rackId) ?? missingRank)
  const rightRank = b.rackId === null ? missingRank + 1 : (ranks.get(b.rackId) ?? missingRank)

  if (leftRank !== rightRank) return leftRank - rightRank

  // Deux casiers inconnus du classement restent déterministes et non ambigus.
  const byRackName = (a.rackName ?? '').localeCompare(b.rackName ?? '', 'fr', {
    sensitivity: 'base',
  })
  if (byRackName !== 0) return byRackName
  const byRackId = (a.rackId ?? '').localeCompare(b.rackId ?? '')
  if (byRackId !== 0) return byRackId

  if (a.slotNumber === null && b.slotNumber !== null) return 1
  if (a.slotNumber !== null && b.slotNumber === null) return -1
  const bySlot = (a.slotNumber ?? 0) - (b.slotNumber ?? 0)
  return bySlot || a.id.localeCompare(b.id)
}

/** Regroupe uniquement les exemplaires qui partagent exactement la même fiche `Wine`. */
export function groupBottles(
  bottles: readonly BottleView[],
  rackOrder: readonly string[],
  highlightedIds: ReadonlySet<string> = new Set(),
): BottleGroup[] {
  const byWine = new Map<string, BottleView[]>()

  for (const bottle of bottles) {
    const group = byWine.get(bottle.wine.id)
    if (group) group.push(bottle)
    else byWine.set(bottle.wine.id, [bottle])
  }

  return [...byWine.entries()]
    .map(([wineId, grouped]) => {
      const ordered = [...grouped].sort((a, b) => compareBottleLocations(a, b, rackOrder))
      return {
        wineId,
        representative: ordered[0]!,
        bottles: ordered,
        count: ordered.length,
        highlighted: ordered.some((bottle) => highlightedIds.has(bottle.id)),
      }
    })
    .sort((a, b) => compareBottleLocations(a.representative, b.representative, rackOrder))
}

export function bottleGroupLocationLabel(group: BottleGroup): string {
  const locations = group.bottles.map((bottle) => {
    if (bottle.slotNumber === null) return 'sans emplacement'
    const rack = bottle.rackName ? ` dans ${bottle.rackName}` : ''
    return `emplacement ${bottle.slotNumber}${rack}`
  })
  const count = group.count === 1 ? '1 bouteille' : `${group.count} bouteilles`
  return `${count} : ${locations.join(', ')}`
}
