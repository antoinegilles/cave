interface Recommendation {
  locations: {
    rackId: string | null
    slotNumber: number | null
  }[]
}

interface RackRef {
  id: string
  name: string
  slots: { number: number }[]
}

/**
 * Résout tous les emplacements physiques renvoyés pour chaque `Wine`. `rackId` est la clé
 * canonique : deux casiers homonymes ne peuvent plus rendre l'allumage ambigu.
 */
export function resolveRecommendationSlots(
  recommendations: Recommendation[],
  racks: RackRef[],
): string[] {
  const byId = new Map(racks.map((rack) => [rack.id, rack]))

  const keys = new Set<string>()
  for (const reco of recommendations) {
    for (const location of reco.locations) {
      if (location.rackId === null || location.slotNumber === null) continue
      const rack = byId.get(location.rackId)
      if (!rack?.slots.some((slot) => slot.number === location.slotNumber)) continue
      keys.add(`${rack.id}:${location.slotNumber}`)
    }
  }

  return [...keys]
}
