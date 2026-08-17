/**
 * Formatage français des libellés d'interface.
 *
 * Regroupé ici parce que ces chaînes partent aussi dans des régions `aria-live` : « 3
 * vin(s) » se lit « trois vin parenthèse esse » à la synthèse vocale. Les formes pleines
 * ne coûtent rien et se lisent correctement dans les deux canaux.
 */

/** « 1 vin » / « 3 vins ». Le pluriel par défaut ajoute un « s ». */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** « 12 », « 12 et 34 », « 12, 34 et 51 ». */
export function joinFr(items: (string | number)[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return String(items[0])
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

/** « 3,5 » — la virgule décimale française. */
export function decimalFr(value: number, digits = 1): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Phrase annoncée après une recherche, pour les lecteurs d'écran. */
export function slotAnswer(total: number, label: string, numbers: number[]): string {
  if (total === 0) return `Aucun vin trouvé pour « ${label} ».`
  const found = `${plural(total, 'vin trouvé', 'vins trouvés')} pour « ${label} »`
  if (numbers.length === 0) return `${found}.`
  const places = numbers.length > 1 ? 'emplacements' : 'emplacement'
  return `${found} — ${places} ${joinFr(numbers)}.`
}

interface SlotGroup {
  rackName: string
  numbers: number[]
}

/** Phrase non ambiguë quand deux casiers utilisent les mêmes numéros. */
export function groupedSlotAnswer(total: number, label: string, groups: SlotGroup[]): string {
  if (total === 0) return `Aucun vin trouvé pour « ${label} ».`
  const found = `${plural(total, 'vin trouvé', 'vins trouvés')} pour « ${label} »`
  if (groups.length === 0) return `${found}.`
  if (groups.length === 1) return slotAnswer(total, label, groups[0]!.numbers)

  const places = groups.map((group) => {
    const noun = group.numbers.length > 1 ? 'emplacements' : 'emplacement'
    return `casier ${group.rackName} : ${noun} ${joinFr(group.numbers)}`
  })
  return `${found} — ${places.join(' ; ')}.`
}

/** Annonce séparément les fiches vin regroupées et leurs exemplaires physiques. */
export function groupedBottleSlotAnswer(
  wineTotal: number,
  bottleTotal: number,
  label: string,
  groups: SlotGroup[],
  includeRackNames = false,
): string {
  if (wineTotal === 0) return `Aucun vin trouvé pour « ${label} ».`
  const found = `${plural(wineTotal, 'vin trouvé', 'vins trouvés')} · ${plural(bottleTotal, 'bouteille')} pour « ${label} »`
  if (groups.length === 0) return `${found}.`

  const places = groups.map((group) => {
    const noun = group.numbers.length > 1 ? 'emplacements' : 'emplacement'
    return `casier ${group.rackName} : ${noun} ${joinFr(group.numbers)}`
  })
  if (groups.length === 1 && !includeRackNames) {
    const noun = groups[0]!.numbers.length > 1 ? 'emplacements' : 'emplacement'
    return `${found} — ${noun} ${joinFr(groups[0]!.numbers)}.`
  }
  return `${found} — ${places.join(' ; ')}.`
}
