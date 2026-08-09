import { describe, expect, it } from 'vitest'
import { buildDedupeKey, normalizeForDedupe } from './dedupe.js'
import { formatSlotNumber, generateSlots } from './slots.js'

describe('generateSlots', () => {
  it('génère un emplacement par case', () => {
    expect(generateSlots(6, 10, 'ROW_MAJOR', 1)).toHaveLength(60)
  })

  it('numérote ligne par ligne en ROW_MAJOR', () => {
    const slots = generateSlots(3, 4, 'ROW_MAJOR', 1)

    // Rangée du bas (row 0) : 1 à 4, de gauche à droite.
    expect(slots.find((s) => s.row === 0 && s.col === 0)?.number).toBe(1)
    expect(slots.find((s) => s.row === 0 && s.col === 3)?.number).toBe(4)
    // Rangée suivante : on repart à 5.
    expect(slots.find((s) => s.row === 1 && s.col === 0)?.number).toBe(5)
    expect(slots.find((s) => s.row === 2 && s.col === 3)?.number).toBe(12)
  })

  it('numérote colonne par colonne en COL_MAJOR', () => {
    const slots = generateSlots(3, 4, 'COL_MAJOR', 1)

    expect(slots.find((s) => s.row === 0 && s.col === 0)?.number).toBe(1)
    expect(slots.find((s) => s.row === 2 && s.col === 0)?.number).toBe(3)
    expect(slots.find((s) => s.row === 0 && s.col === 1)?.number).toBe(4)
  })

  it('respecte un numéro de départ personnalisé', () => {
    const slots = generateSlots(2, 3, 'ROW_MAJOR', 101)
    const numbers = slots.map((s) => s.number).sort((a, b) => a - b)
    expect(numbers).toEqual([101, 102, 103, 104, 105, 106])
  })

  it('accepte de commencer à zéro', () => {
    expect(generateSlots(2, 2, 'ROW_MAJOR', 0).some((s) => s.number === 0)).toBe(true)
  })

  it('ne produit jamais de numéro ni de position en double', () => {
    for (const numbering of ['ROW_MAJOR', 'COL_MAJOR'] as const) {
      const slots = generateSlots(5, 7, numbering, 1)
      expect(new Set(slots.map((s) => s.number)).size).toBe(35)
      expect(new Set(slots.map((s) => `${s.row}:${s.col}`)).size).toBe(35)
    }
  })

  it('gère un casier d’une seule case', () => {
    expect(generateSlots(1, 1, 'ROW_MAJOR', 7)).toEqual([{ number: 7, row: 0, col: 0 }])
  })
})

describe('formatSlotNumber', () => {
  it('complète sur deux chiffres comme l’étiquette physique', () => {
    expect(formatSlotNumber(3)).toBe('03')
    expect(formatSlotNumber(0)).toBe('00')
    expect(formatSlotNumber(12)).toBe('12')
    expect(formatSlotNumber(105)).toBe('105')
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
