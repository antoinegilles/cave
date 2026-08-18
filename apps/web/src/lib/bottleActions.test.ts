import { describe, expect, it } from 'vitest'
import {
  formatDrinkCta,
  formatOpenedNotification,
  initialBottleSelection,
} from './bottleActions'

describe('parcours d’ouverture', () => {
  const bottles = [
    { id: 'bottle-15', slotNumber: 15 },
    { id: 'bottle-16', slotNumber: 16 },
    { id: 'bottle-17', slotNumber: 17 },
  ]

  it('présélectionne le slot de la bouteille représentative', () => {
    expect(initialBottleSelection(bottles, 'bottle-16')).toEqual(['bottle-16'])
  })

  it('écarte un exemplaire sans position et choisit le premier emplacement valide', () => {
    expect(
      initialBottleSelection(
        [{ id: 'missing-slot', slotNumber: null }, ...bottles],
        'missing-slot',
      ),
    ).toEqual(['bottle-15'])
  })

  it('produit un CTA singulier ou pluriel précis', () => {
    expect(formatDrinkCta([bottles[1]!])).toBe('Ouvrir la bouteille n° 16')
    expect(formatDrinkCta([bottles[0]!, bottles[2]!])).toBe('Ouvrir 2 bouteilles')
  })

  it('énumère tous les emplacements libérés dans la notification', () => {
    expect(
      formatOpenedNotification([
        { bottleId: 'bottle-15', slotNumber: 15, rackId: 'rack-1', rackName: 'Cave' },
        { bottleId: 'bottle-17', slotNumber: 17, rackId: 'rack-2', rackName: 'Garage' },
      ]),
    ).toBe('2 bouteilles ouvertes. Emplacements Cave · n° 15 et Garage · n° 17 libérés.')
  })

  it('n’annonce pas un emplacement encore occupé comme libéré', () => {
    expect(formatOpenedNotification([], 1)).toBe(
      'Bouteille ouverte. L’emplacement contient encore des bouteilles.',
    )
  })
})
