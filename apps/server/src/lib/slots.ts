import { MAX_SLOT_NUMBER, type RackNumbering } from '@cave/shared'

export interface SlotPosition {
  number: number
  row: number
  col: number
}

/**
 * Génère les emplacements d'un casier.
 *
 * La numérotation doit correspondre à ce qui est écrit **physiquement** sur le casier :
 * - ROW_MAJOR : on numérote ligne par ligne (1..cols sur la rangée du bas, puis on monte).
 * - COL_MAJOR : on numérote colonne par colonne (1..rows sur la colonne de gauche).
 *
 * `row` 0 est la rangée **du bas** — c'est ainsi qu'on lit un casier à vin, et la vue SVG
 * inverse l'axe pour l'afficher. `startNumber` permet de commencer à 0 ou à 101.
 */
export function generateSlots(
  rows: number,
  cols: number,
  numbering: RackNumbering,
  startNumber: number,
): SlotPosition[] {
  const slots: SlotPosition[] = []

  if (numbering === 'ROW_MAJOR') {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        slots.push({ number: startNumber + row * cols + col, row, col })
      }
    }
  } else {
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        slots.push({ number: startNumber + col * rows + row, row, col })
      }
    }
  }

  return slots
}

/**
 * Affichage sur 2 chiffres minimum : le casier physique est étiqueté « 03 », pas « 3 ».
 *
 * Le complément ne vaut que si tout le casier tient sur deux chiffres. Dès qu'un
 * emplacement a été renuméroté au-delà (une cave 1, 2, 3, 100, 5, 6 est un cas réel),
 * afficher « 05 » à côté de « 100 » invente une numérotation qui n'existe pas sur le
 * meuble : on rend alors les numéros tels qu'ils sont écrits. Voir `shouldPadSlots`.
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

export interface SlotReconciliation {
  /** Positions apparues avec le nouveau format, à créer. */
  toCreate: SlotPosition[]
  /** Emplacements hors de la nouvelle grille, à supprimer. */
  toDelete: ExistingSlot[]
}

export interface RenumberedSlot {
  id: string
  number: number
}

/** Calcule les étiquettes à partir du début propre à chaque rangée. */
export function renumberByRow(
  slots: ExistingSlot[],
  rows: number,
  numbering: RackNumbering,
  startNumbers: number[],
): RenumberedSlot[] {
  if (startNumbers.length !== rows) {
    throw new Error(`Indique exactement ${rows} débuts de rangée.`)
  }

  const step = numbering === 'ROW_MAJOR' ? 1 : rows
  const result = slots.map((slot) => ({
    id: slot.id,
    number: startNumbers[slot.row]! + slot.col * step,
  }))
  if (result.some((slot) => slot.number > MAX_SLOT_NUMBER)) {
    throw new Error(`Un numéro dépasse ${MAX_SLOT_NUMBER.toLocaleString('fr-FR')}.`)
  }
  if (new Set(result.map((slot) => slot.number)).size !== result.length) {
    throw new Error('La renumérotation produirait des numéros en double.')
  }
  return result
}

/**
 * Réconcilie les emplacements d'un casier après un redimensionnement.
 *
 * On raisonne en **positions** `(row, col)`, jamais en numéros : un emplacement *est* une
 * case physique du meuble, son numéro n'en est que l'étiquette. Réconcilier par numéro —
 * ce que faisait la route auparavant — supprimait tout emplacement renuméroté hors de la
 * suite générée, donc effaçait silencieusement la numérotation personnalisée au premier
 * changement de taille.
 *
 * Conséquence voulue : les cases qui survivent **gardent leur numéro**. Seules les cases
 * nouvellement créées en reçoivent un, pris dans la suite générée puis, si celui-ci est
 * déjà utilisé, au premier numéro libre au-dessus du maximum existant.
 *
 * Renuméroter tout le casier reste possible, mais c'est un geste explicite : changer
 * `numbering` ou `startNumber` (voir la route, qui régénère alors entièrement).
 */
export function reconcileSlots(
  existing: ExistingSlot[],
  rows: number,
  cols: number,
  numbering: RackNumbering,
  startNumber: number,
): SlotReconciliation {
  const target = generateSlots(rows, cols, numbering, startNumber)
  const positionKey = (p: { row: number; col: number }) => `${p.row}:${p.col}`

  const byPosition = new Map(existing.map((slot) => [positionKey(slot), slot]))

  // Les numéros des cases conservées sont intouchables : on les recense avant d'attribuer
  // quoi que ce soit aux nouvelles.
  const taken = new Set<number>()
  let highest = startNumber - 1
  for (const position of target) {
    const kept = byPosition.get(positionKey(position))
    if (!kept) continue
    taken.add(kept.number)
    if (kept.number > highest) highest = kept.number
  }

  let nextFree = highest + 1
  const toCreate: SlotPosition[] = []

  for (const position of target) {
    if (byPosition.has(positionKey(position))) continue
    // Le numéro généré est le premier choix ; s'il est déjà porté par une case conservée,
    // on prend le premier numéro libre au-dessus de tous les autres.
    let number = position.number
    if (taken.has(number)) {
      while (taken.has(nextFree)) nextFree++
      number = nextFree++
    }
    if (number > MAX_SLOT_NUMBER) {
      throw new Error(
        `Aucun numéro libre inférieur ou égal à ${MAX_SLOT_NUMBER.toLocaleString('fr-FR')}.`,
      )
    }
    taken.add(number)
    toCreate.push({ ...position, number })
  }

  const targetPositions = new Set(target.map(positionKey))
  const toDelete = existing.filter((slot) => !targetPositions.has(positionKey(slot)))

  return { toCreate, toDelete }
}
