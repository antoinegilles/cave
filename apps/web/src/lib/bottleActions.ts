import type { FreedSlotView } from './types'

interface BottleChoice {
  id: string
  slotNumber: number | null
}

export function initialBottleSelection(
  bottles: BottleChoice[],
  representativeId: string | undefined,
): string[] {
  const selectable = bottles.filter((bottle) => bottle.slotNumber !== null)
  const representative = selectable.find((bottle) => bottle.id === representativeId)
  const selected = representative ?? selectable[0]
  return selected ? [selected.id] : []
}

export function formatDrinkCta(bottles: BottleChoice[]): string {
  if (bottles.length === 0) return 'Sélectionne au moins une bouteille'
  if (bottles.length === 1) return `Ouvrir la bouteille n° ${bottles[0]!.slotNumber}`
  return `Ouvrir ${bottles.length} bouteilles`
}

function joinFrench(values: string[]): string {
  if (values.length < 2) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} et ${values.at(-1)}`
}

export function formatOpenedNotification(
  freedSlots: FreedSlotView[],
  openedCount = freedSlots.length,
): string {
  if (freedSlots.length === 0) {
    return openedCount > 1
      ? `${openedCount} bouteilles ouvertes. Les emplacements contiennent encore des bouteilles.`
      : 'Bouteille ouverte. L’emplacement contient encore des bouteilles.'
  }
  const locations = freedSlots.map((slot) => `${slot.rackName} · n° ${slot.slotNumber}`)
  if (freedSlots.length === 1) {
    return `Bouteille ouverte. Emplacement ${locations[0]} libéré.`
  }
  return `${openedCount} bouteilles ouvertes. Emplacements ${joinFrench(locations)} libérés.`
}
