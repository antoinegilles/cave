import { describe, expect, it } from 'vitest'
import { decimalFr, groupedSlotAnswer, joinFr, plural, slotAnswer } from './format.js'

describe('plural', () => {
  it('accorde au singulier et au pluriel', () => {
    expect(plural(0, 'vin')).toBe('0 vins')
    expect(plural(1, 'vin')).toBe('1 vin')
    expect(plural(3, 'vin')).toBe('3 vins')
  })

  it('accepte un pluriel irrégulier', () => {
    expect(plural(3, 'vin trouvé', 'vins trouvés')).toBe('3 vins trouvés')
  })
})

describe('joinFr', () => {
  it('énumère avec la conjonction française', () => {
    expect(joinFr([])).toBe('')
    expect(joinFr([12])).toBe('12')
    expect(joinFr([12, 34])).toBe('12 et 34')
    expect(joinFr([12, 34, 51])).toBe('12, 34 et 51')
  })
})

describe('decimalFr', () => {
  it('utilise la virgule décimale', () => {
    expect(decimalFr(3.5)).toBe('3,5')
    expect(decimalFr(4)).toBe('4,0')
  })
})

describe('slotAnswer', () => {
  it('annonce les emplacements trouvés', () => {
    expect(slotAnswer(3, 'poisson', [12, 34, 51])).toBe(
      '3 vins trouvés pour « poisson » — emplacements 12, 34 et 51.',
    )
  })

  it('accorde emplacement au singulier', () => {
    expect(slotAnswer(1, 'bordeaux', [7])).toBe(
      '1 vin trouvé pour « bordeaux » — emplacement 7.',
    )
  })

  it('reste lisible sans résultat', () => {
    expect(slotAnswer(0, 'xyz', [])).toBe('Aucun vin trouvé pour « xyz ».')
  })
})

describe('groupedSlotAnswer', () => {
  it('nomme chaque casier quand les numéros peuvent être ambigus', () => {
    expect(
      groupedSlotAnswer(3, 'rouge', [
        { rackName: 'Cave', numbers: [3, 12] },
        { rackName: 'Garage', numbers: [3] },
      ]),
    ).toBe(
      '3 vins trouvés pour « rouge » — casier Cave : emplacements 3 et 12 ; casier Garage : emplacement 3.',
    )
  })
})
