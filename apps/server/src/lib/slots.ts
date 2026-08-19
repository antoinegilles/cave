import { RACK_COLUMNS } from '@cave/shared'

export interface SlotPosition {
  number: number
  row: number
  col: number
}

/**
 * Emplacements d'une cave décrite par un intervalle `[first, last]`.
 *
 * La cave n'est plus un meuble « rangées × colonnes » mais une suite continue de numéros.
 * On les dispose en grille de largeur fixe (`RACK_COLUMNS`) pour que le plan reste 2D, mais
 * l'utilisateur ne pense qu'en « de X à Y ». `row` 0 est la rangée du bas, comme on lit un
 * casier — la vue SVG inverse l'axe. La dernière rangée peut être partielle : c'est correct,
 * le plan itère sur les emplacements réels.
 */
export function rangeSlots(first: number, last: number, cols = RACK_COLUMNS): SlotPosition[] {
  const slots: SlotPosition[] = []
  for (let number = first; number <= last; number++) {
    const i = number - first
    slots.push({ number, row: Math.floor(i / cols), col: i % cols })
  }
  return slots
}

/**
 * Géométrie dérivée d'un intervalle, stockée dans `Rack`.
 *
 * `rows`/`cols`/`startNumber` restent en base parce que le plan les lit, mais ils ne sont
 * jamais saisis : ils découlent de l'intervalle. `numbering` est toujours `ROW_MAJOR`.
 */
export function rangeGeometry(first: number, last: number, cols = RACK_COLUMNS) {
  const count = last - first + 1
  return { rows: Math.ceil(count / cols), cols, startNumber: first }
}

/**
 * Affichage sur 2 chiffres minimum : le casier physique est étiqueté « 03 », pas « 3 ».
 *
 * Le complément ne vaut que si tout le casier tient sur deux chiffres. Dès qu'un
 * emplacement dépasse (« 100 » à côté de « 05 » invente une numérotation qui n'est pas sur
 * le meuble), on rend les numéros tels quels. Voir `shouldPadSlots`.
 */
export function formatSlotNumber(n: number, pad = true): string {
  return pad && n < 10 ? `0${n}` : String(n)
}

/** Vrai si tous les numéros du casier tiennent sur deux chiffres. */
export function shouldPadSlots(numbers: number[]): boolean {
  return numbers.every((n) => n < 100)
}

export interface ExistingSlot extends SlotPosition {
  id: string
}

export interface RangeReconciliation {
  /** Numéros apparus dans le nouvel intervalle, à créer. */
  toCreate: SlotPosition[]
  /** Emplacements dont le numéro sort de l'intervalle, à supprimer. */
  toDelete: ExistingSlot[]
  /** Emplacements conservés dont la position d'affichage a changé (numéro inchangé). */
  toMove: { id: string; row: number; col: number }[]
}

/**
 * Réconcilie les emplacements après un changement d'intervalle.
 *
 * On raisonne par **numéro**, jamais par position : l'utilisateur pense « la bouteille est
 * au 47 ». Un emplacement dont le numéro reste dans l'intervalle est conservé — et sa
 * bouteille avec lui. La position `(row, col)` n'est qu'un placement d'affichage : si le
 * premier numéro bouge, toutes les positions glissent sans qu'aucune bouteille ne se
 * déplace, d'où `toMove`. La route applique ces déplacements en deux passes pour ne pas
 * heurter la contrainte d'unicité de position pendant la transaction.
 */
export function reconcileRange(
  existing: ExistingSlot[],
  first: number,
  last: number,
  cols = RACK_COLUMNS,
): RangeReconciliation {
  const target = rangeSlots(first, last, cols)
  const byNumber = new Map(existing.map((slot) => [slot.number, slot]))

  const toCreate: SlotPosition[] = []
  const toMove: { id: string; row: number; col: number }[] = []
  for (const position of target) {
    const kept = byNumber.get(position.number)
    if (!kept) {
      toCreate.push(position)
    } else if (kept.row !== position.row || kept.col !== position.col) {
      toMove.push({ id: kept.id, row: position.row, col: position.col })
    }
  }

  const targetNumbers = new Set(target.map((slot) => slot.number))
  const toDelete = existing.filter((slot) => !targetNumbers.has(slot.number))

  return { toCreate, toDelete, toMove }
}
