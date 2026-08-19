import { describe, expect, it } from 'vitest'
import { bottleGroupLocationLabel, groupBottles } from './bottleGroups'
import type { BottleView, WineView } from './types'

const baseWine: WineView = {
  id: 'wine-1',
  name: 'Baptiste Vieilles Vignes',
  producer: 'Domaine Baptiste',
  vintage: 2020,
  color: 'RED',
  country: 'France',
  region: 'Bordeaux',
  appellation: null,
  grapes: [],
  abv: null,
  description: null,
  producerUrl: null,
  imageUrl: null,
  vivinoUrl: null,
  vivinoRating: null,
  vivinoRatingCount: null,
  priceAvg: null,
  structure: {
    acidity: null,
    tannin: null,
    sweetness: null,
    intensity: null,
    fizziness: null,
  },
  flavors: [],
  source: 'MANUAL',
  foodTags: [],
}

function bottle(
  id: string,
  slotNumber: number | null,
  rackId: string | null,
  rackName: string | null,
  wineId = 'wine-1',
): BottleView {
  return {
    id,
    status: 'IN_CELLAR',
    addedAt: '',
    drunkAt: null,
    personalNote: null,
    personalRating: null,
    purchasePrice: null,
    labelPhotoPath: null,
    ownerLabel: null,
    slotNumber,
    rackId,
    rackName,
    wine: { ...baseWine, id: wineId },
  }
}

describe('groupBottles', () => {
  it('regroupe strictement par wine.id sans modifier les entrées', () => {
    const input = [
      bottle('b-16', 16, 'rack-main', 'Cave'),
      bottle('b-other', 4, 'rack-main', 'Cave', 'wine-other'),
      bottle('b-15', 15, 'rack-main', 'Cave'),
    ]

    const groups = groupBottles(input, ['rack-main'])

    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.wineId === 'wine-1')?.bottles.map((item) => item.id)).toEqual([
      'b-15',
      'b-16',
    ])
    expect(input.map((item) => item.id)).toEqual(['b-16', 'b-other', 'b-15'])
  })

  it('respecte l’ordre des casiers avant le numéro et place les positions absentes à la fin', () => {
    const groups = groupBottles(
      [
        bottle('garage-2', 2, 'rack-garage', 'Garage'),
        bottle('missing', null, null, null),
        bottle('cave-12', 12, 'rack-cave', 'Cave'),
        bottle('garage-1', 1, 'rack-garage', 'Garage'),
      ],
      ['rack-cave', 'rack-garage'],
    )

    expect(groups[0]?.bottles.map((item) => item.id)).toEqual([
      'cave-12',
      'garage-1',
      'garage-2',
      'missing',
    ])
    expect(groups[0]?.representative.id).toBe('cave-12')
  })

  it('ordonne aussi les groupes par casier avant le numéro', () => {
    const groups = groupBottles(
      [
        bottle('garage-1', 1, 'rack-garage', 'Garage', 'wine-garage'),
        bottle('cave-40', 40, 'rack-cave', 'Cave', 'wine-cave'),
      ],
      ['rack-cave', 'rack-garage'],
    )

    expect(groups.map((group) => group.wineId)).toEqual(['wine-cave', 'wine-garage'])
  })

  it('agrège la surbrillance de tous les exemplaires', () => {
    const groups = groupBottles(
      [bottle('b-15', 15, 'rack-main', 'Cave'), bottle('b-16', 16, 'rack-main', 'Cave')],
      ['rack-main'],
      new Set(['b-16']),
    )

    expect(groups[0]?.highlighted).toBe(true)
    expect(groups[0]?.count).toBe(2)
  })

  it('nomme les casiers dans le libellé accessible', () => {
    const [group] = groupBottles(
      [bottle('cave-3', 3, 'rack-cave', 'Cave'), bottle('garage-3', 3, 'rack-garage', 'Garage')],
      ['rack-cave', 'rack-garage'],
    )

    expect(bottleGroupLocationLabel(group!)).toBe(
      '2 bouteilles : emplacement 3 dans Cave, emplacement 3 dans Garage',
    )
  })
})
