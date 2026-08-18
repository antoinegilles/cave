import { generateSlots } from './slots.js'

export const DEFAULT_CELLAR_ROWS = 6
export const DEFAULT_CELLAR_COLS = 10

/** Forme Prisma commune à l'inscription, à la création admin et au seed. */
export function defaultCellarCreate(name = 'Ma cave') {
  return {
    name,
    rows: DEFAULT_CELLAR_ROWS,
    cols: DEFAULT_CELLAR_COLS,
    numbering: 'ROW_MAJOR',
    startNumber: 1,
    position: 0,
    slots: {
      create: generateSlots(DEFAULT_CELLAR_ROWS, DEFAULT_CELLAR_COLS, 'ROW_MAJOR', 1),
    },
  }
}
