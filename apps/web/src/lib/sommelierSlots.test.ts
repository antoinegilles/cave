import { describe, expect, it } from 'vitest'
import { resolveRecommendationSlots } from './sommelierSlots.js'

const cave = { id: 'r1', name: 'Cave principale', slots: [{ number: 12 }] }
const garage = { id: 'r2', name: 'Garage', slots: [{ number: 12 }] }

describe('resolveRecommendationSlots', () => {
  it('résout un nom de casier exact', () => {
    expect(
      resolveRecommendationSlots([{ slotNumber: 12, rackName: 'Garage' }], [cave, garage]),
    ).toEqual(['r2:12'])
  })

  /**
   * Le bug corrigé : le repli « ?? casier actif » allumait le numéro sur le mauvais
   * meuble et envoyait chercher une bouteille absente.
   */
  it('n’allume rien quand le casier est inconnu et qu’il y a le choix', () => {
    expect(
      resolveRecommendationSlots([{ slotNumber: 12, rackName: 'Cellier' }], [cave, garage]),
    ).toEqual([])
  })

  it('n’allume rien quand le casier est absent et qu’il y a le choix', () => {
    expect(
      resolveRecommendationSlots([{ slotNumber: 12, rackName: null }], [cave, garage]),
    ).toEqual([])
  })

  it('résout un casier absent quand la cave n’en compte qu’un', () => {
    expect(resolveRecommendationSlots([{ slotNumber: 12, rackName: null }], [cave])).toEqual([
      'r1:12',
    ])
  })

  it('ignore une recommandation sans emplacement', () => {
    expect(resolveRecommendationSlots([{ slotNumber: null, rackName: 'Garage' }], [garage])).toEqual(
      [],
    )
  })

  it('accepte une cave sans casier', () => {
    expect(resolveRecommendationSlots([{ slotNumber: 12, rackName: null }], [])).toEqual([])
  })

  it('ignore un emplacement absent du casier', () => {
    expect(resolveRecommendationSlots([{ slotNumber: 99, rackName: 'Garage' }], [garage])).toEqual(
      [],
    )
  })

  it('ignore un nom de casier ambigu', () => {
    const otherGarage = { id: 'r3', name: 'Garage', slots: [{ number: 12 }] }
    expect(
      resolveRecommendationSlots([{ slotNumber: 12, rackName: 'Garage' }], [
        garage,
        otherGarage,
      ]),
    ).toEqual([])
  })

  it('déduplique les emplacements répétés', () => {
    expect(
      resolveRecommendationSlots(
        [
          { slotNumber: 12, rackName: 'Garage' },
          { slotNumber: 12, rackName: 'Garage' },
        ],
        [garage],
      ),
    ).toEqual(['r2:12'])
  })
})
