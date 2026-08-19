import { RACK_COLUMNS } from '@cave/shared'
import { describe, expect, it } from 'vitest'
import { buildDedupeKey, normalizeForDedupe } from './dedupe.js'
import {
  formatSlotNumber,
  rangeGeometry,
  rangeSlots,
  reconcileRange,
  shouldPadSlots,
} from './slots.js'

describe('rangeSlots', () => {
  it('produit exactement les numéros de l’intervalle', () => {
    const slots = rangeSlots(10, 200)
    expect(slots).toHaveLength(191)
    expect(slots[0]).toEqual({ number: 10, row: 0, col: 0 })
    expect(slots.at(-1)).toEqual({ number: 200, row: 19, col: 0 })
  })

  it('dispose les numéros en grille de largeur fixe, rangée par rangée', () => {
    const slots = rangeSlots(1, 25)
    // La rangée du bas (row 0) porte 1..10, la suivante 11..20.
    expect(slots.find((s) => s.number === 1)).toEqual({ number: 1, row: 0, col: 0 })
    expect(slots.find((s) => s.number === 10)).toEqual({ number: 10, row: 0, col: 9 })
    expect(slots.find((s) => s.number === 11)).toEqual({ number: 11, row: 1, col: 0 })
    // La dernière rangée est partielle : 21..25 seulement.
    expect(slots.find((s) => s.number === 25)).toEqual({ number: 25, row: 2, col: 4 })
  })

  it('gère un intervalle d’un seul emplacement', () => {
    expect(rangeSlots(7, 7)).toEqual([{ number: 7, row: 0, col: 0 }])
  })

  it('accepte de commencer à zéro', () => {
    expect(rangeSlots(0, 3).map((s) => s.number)).toEqual([0, 1, 2, 3])
  })

  it('ne produit jamais de numéro ni de position en double', () => {
    const slots = rangeSlots(100, 137)
    expect(new Set(slots.map((s) => s.number)).size).toBe(38)
    expect(new Set(slots.map((s) => `${s.row}:${s.col}`)).size).toBe(38)
  })
})

describe('rangeGeometry', () => {
  it('dérive la géométrie stockée sur le casier', () => {
    expect(rangeGeometry(10, 200)).toEqual({ rows: 20, cols: RACK_COLUMNS, startNumber: 10 })
  })

  it('arrondit à la rangée supérieure quand la dernière est partielle', () => {
    expect(rangeGeometry(1, 25)).toEqual({ rows: 3, cols: RACK_COLUMNS, startNumber: 1 })
  })

  it('gère un intervalle d’un seul emplacement', () => {
    expect(rangeGeometry(7, 7)).toEqual({ rows: 1, cols: RACK_COLUMNS, startNumber: 7 })
  })
})

describe('formatSlotNumber', () => {
  it('complète sur deux chiffres comme l’étiquette physique', () => {
    expect(formatSlotNumber(3)).toBe('03')
    expect(formatSlotNumber(0)).toBe('00')
    expect(formatSlotNumber(12)).toBe('12')
    expect(formatSlotNumber(105)).toBe('105')
  })

  it('renonce au complément quand le casier mélange les longueurs', () => {
    // « 05 » à côté de « 100 » inventerait une numérotation qui n'est pas sur le meuble.
    expect(formatSlotNumber(5, false)).toBe('5')
  })
})

describe('shouldPadSlots', () => {
  it('complète un casier ordinaire', () => {
    expect(shouldPadSlots([1, 9, 60])).toBe(true)
  })

  it('renonce dès qu’un emplacement dépasse deux chiffres', () => {
    expect(shouldPadSlots([1, 2, 3, 100, 5, 6])).toBe(false)
  })

  it('accepte un casier vide', () => {
    expect(shouldPadSlots([])).toBe(true)
  })
})

describe('reconcileRange', () => {
  /** Cave 10 → 30 telle que stockée, avec des identifiants d'emplacement stables. */
  function existingRack(first = 10, last = 30) {
    return rangeSlots(first, last).map((slot) => ({ ...slot, id: `slot-${slot.number}` }))
  }

  it('conserve les emplacements dont le numéro reste dans l’intervalle', () => {
    // On étend 10→30 vers 10→40 : rien ne disparaît, seuls 31..40 sont créés.
    const { toCreate, toDelete, toMove } = reconcileRange(existingRack(), 10, 40)

    expect(toDelete).toEqual([])
    expect(toMove).toEqual([])
    expect(toCreate.map((s) => s.number)).toEqual([
      31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ])
  })

  it('ne supprime que les numéros sortis de l’intervalle', () => {
    // On resserre 10→30 vers 10→20 : 21..30 partent, le reste demeure.
    const { toCreate, toDelete, toMove } = reconcileRange(existingRack(), 10, 20)

    expect(toCreate).toEqual([])
    expect(toMove).toEqual([])
    expect(toDelete.map((s) => s.number).sort((a, b) => a - b)).toEqual([
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ])
  })

  it('conserve la bouteille par son numéro quand le premier numéro glisse', () => {
    // 10→30 devient 5→30 : le numéro 20 est conservé (id inchangé) mais sa position
    // d'affichage glisse d'une rangée puisque tout l'intervalle se décale.
    const { toCreate, toDelete, toMove } = reconcileRange(existingRack(), 5, 30)

    expect(toDelete).toEqual([])
    expect(toCreate.map((s) => s.number).sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9])
    // Le 20 était en (row 1, col 0) pour un départ à 10 ; pour un départ à 5 il passe
    // en (row 1, col 5). Son id ne change pas : aucune bouteille n'est déplacée.
    const moved = toMove.find((m) => m.id === 'slot-20')
    expect(moved).toEqual({ id: 'slot-20', row: 1, col: 5 })
  })

  it('laisse un casier intact quand l’intervalle ne change pas', () => {
    const { toCreate, toDelete, toMove } = reconcileRange(existingRack(), 10, 30)
    expect(toCreate).toEqual([])
    expect(toDelete).toEqual([])
    expect(toMove).toEqual([])
  })
})

describe('normalizeForDedupe', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(normalizeForDedupe('Château Margaux')).toBe(normalizeForDedupe('chateau  margaux!'))
  })

  it('retire les mots de liaison des noms de domaines', () => {
    // « Château » et « Domaine » ne distinguent pas deux vins entre eux.
    expect(normalizeForDedupe('Château Margaux')).toBe('margaux')
    expect(normalizeForDedupe('Domaine de la Romanée-Conti')).toBe('romanee conti')
  })
})

describe('buildDedupeKey', () => {
  it('fait converger deux saisies du même vin', () => {
    expect(buildDedupeKey('Château Margaux', 'Margaux', 2015)).toBe(
      buildDedupeKey('chateau  margaux', 'MARGAUX', 2015),
    )
  })

  it('sépare deux millésimes différents', () => {
    expect(buildDedupeKey('Château Margaux', 'Margaux', 2015)).not.toBe(
      buildDedupeKey('Château Margaux', 'Margaux', 2016),
    )
  })

  it('distingue le millésime absent d’un millésime réel', () => {
    expect(buildDedupeKey('X', 'Y', null)).toContain('|nv')
    expect(buildDedupeKey('X', 'Y', null)).not.toBe(buildDedupeKey('X', 'Y', 2020))
  })

  it('sépare deux vins différents du même domaine', () => {
    expect(buildDedupeKey('Domaine Leflaive', 'Puligny-Montrachet', 2019)).not.toBe(
      buildDedupeKey('Domaine Leflaive', 'Bâtard-Montrachet', 2019),
    )
  })
})
