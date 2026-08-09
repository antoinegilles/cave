import type { RackNumbering } from '@cave/shared'

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

/** Affichage sur 2 chiffres minimum : le casier physique est étiqueté « 03 », pas « 3 ». */
export function formatSlotNumber(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
