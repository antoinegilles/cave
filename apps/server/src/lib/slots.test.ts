import { describe, expect, it } from 'vitest'
import { buildDedupeKey, normalizeForDedupe } from './dedupe.js'
import { formatSlotNumber, generateSlots, reconcileSlots, shouldPadSlots } from './slots.js'

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

describe('reconcileSlots', () => {
  /** Casier 2×3 numéroté par défaut, dont l'emplacement (0,1) a été renuméroté 100. */
  function customRack() {
    return generateSlots(2, 3, 'ROW_MAJOR', 1).map((s, i) => ({
      ...s,
      id: `slot-${i}`,
      number: s.row === 0 && s.col === 1 ? 100 : s.number,
    }))
  }

  it('préserve un numéro personnalisé quand on agrandit le casier', () => {
    const { toCreate, toDelete } = reconcileSlots(customRack(), 2, 4, 'ROW_MAJOR', 1)

    // Aucune case existante ne disparaît, et le 100 n'est jamais recréé ni écrasé.
    expect(toDelete).toEqual([])
    expect(toCreate.map((s) => `${s.row}:${s.col}`).sort()).toEqual(['0:3', '1:3'])
    expect(toCreate.some((s) => s.number === 100)).toBe(false)
  })

  it('ne supprime que les positions sorties de la grille', () => {
    const { toCreate, toDelete } = reconcileSlots(customRack(), 2, 2, 'ROW_MAJOR', 1)

    expect(toCreate).toEqual([])
    expect(toDelete.map((s) => `${s.row}:${s.col}`).sort()).toEqual(['0:2', '1:2'])
  })

  it('n’attribue jamais un numéro déjà porté par une case conservée', () => {
    // La suite générée pour un 2×4 contient 5, or 5 est déjà pris par la case (1,1)
    // du casier d'origine — la nouvelle case doit recevoir autre chose.
    const existing = customRack()
    const { toCreate } = reconcileSlots(existing, 2, 4, 'ROW_MAJOR', 1)

    const kept = existing
      .filter((s) => s.row < 2 && s.col < 4)
      .map((s) => s.number)
    const created = toCreate.map((s) => s.number)

    expect(new Set([...kept, ...created]).size).toBe(kept.length + created.length)
  })

  it('laisse un casier intact quand rien ne change', () => {
    const { toCreate, toDelete } = reconcileSlots(customRack(), 2, 3, 'ROW_MAJOR', 1)
    expect(toCreate).toEqual([])
    expect(toDelete).toEqual([])
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
