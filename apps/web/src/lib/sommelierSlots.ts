interface Recommendation {
  slotNumber: number | null
  rackName: string | null
}

interface RackRef {
  id: string
  name: string
  slots: { number: number }[]
}

/**
 * Résout les emplacements recommandés par le sommelier en clés `rackId:slotNumber`.
 *
 * Le repli précédent — « casier inconnu ? on prend le casier actif » — allumait le bon
 * numéro sur le **mauvais** meuble, et envoyait donc chercher une bouteille qui n'y est
 * pas. Un plan éteint est une réponse honnête ; un plan qui ment ne l'est pas.
 *
 * Règles : nom exact → ce casier ; nom absent **et** un seul casier en cave → ce casier,
 * il n'y a pas d'ambiguïté possible ; tout le reste → on n'allume rien.
 */
export function resolveRecommendationSlots(
  recommendations: Recommendation[],
  racks: RackRef[],
): string[] {
  const byName = new Map<string, RackRef[]>()
  for (const rack of racks) {
    const matches = byName.get(rack.name) ?? []
    matches.push(rack)
    byName.set(rack.name, matches)
  }
  const onlyRack = racks.length === 1 ? racks[0] : null

  const keys = new Set<string>()
  for (const reco of recommendations) {
    if (reco.slotNumber === null) continue

    const named = reco.rackName ? byName.get(reco.rackName) : null
    const rack = named?.length === 1 ? named[0] : reco.rackName ? null : onlyRack
    if (!rack?.slots.some((slot) => slot.number === reco.slotNumber)) continue

    keys.add(`${rack.id}:${reco.slotNumber}`)
  }

  return [...keys]
}
