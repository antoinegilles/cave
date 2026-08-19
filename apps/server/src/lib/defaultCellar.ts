import { rangeGeometry, rangeSlots } from './slots.js'

/** Intervalle de la cave créée d'office : 1 → 60, soit une cave 6 × 10 de départ. */
export const DEFAULT_CELLAR_FIRST = 1
export const DEFAULT_CELLAR_LAST = 60

/** Forme Prisma commune à l'inscription, à la création admin et au seed. */
export function defaultCellarCreate(name = 'Ma cave') {
  return {
    name,
    ...rangeGeometry(DEFAULT_CELLAR_FIRST, DEFAULT_CELLAR_LAST),
    numbering: 'ROW_MAJOR',
    position: 0,
    slots: {
      create: rangeSlots(DEFAULT_CELLAR_FIRST, DEFAULT_CELLAR_LAST),
    },
  }
}
