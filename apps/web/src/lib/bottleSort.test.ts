import { describe, expect, it } from 'vitest'
import { compareBottles, DEFAULT_SORT_DIRECTIONS } from './bottleSort'
import type { BottleView } from './types'

function bottle(
  id: string,
  slotNumber: number | null,
  name: string,
  rating: number | null = null,
  vintage: number | null = null,
): BottleView {
  return {
    id,
    slotNumber,
    status: 'IN_CELLAR',
    addedAt: '',
    drunkAt: null,
    personalNote: null,
    personalRating: null,
    purchasePrice: null,
    labelPhotoPath: null,
    rackId: null,
    rackName: null,
    wine: {
      id: `wine-${id}`,
      name,
      producer: null,
      vintage,
      color: null,
      country: null,
      region: null,
      appellation: null,
      grapes: [],
      abv: null,
      description: null,
      producerUrl: null,
      imageUrl: null,
      vivinoUrl: null,
      vivinoRating: rating,
      vivinoRatingCount: null,
      priceAvg: null,
      structure: {
        tannin: null,
        acidity: null,
        sweetness: null,
        intensity: null,
        fizziness: null,
      },
      flavors: [],
      source: 'MANUAL',
      foodTags: [],
    },
  }
}

describe('compareBottles', () => {
  const low = bottle('b', 2, 'Bourgogne', 3.8, 2018)
  const high = bottle('a', 1, 'Alsace', 4.5, 2022)
  const unknown = bottle('c', null, 'Chablis')

  it('respecte les directions par défaut attendues', () => {
    expect(DEFAULT_SORT_DIRECTIONS).toEqual({
      slot: 'asc',
      name: 'asc',
      rating: 'desc',
      vintage: 'desc',
    })
    expect([low, high].sort((a, b) => compareBottles(a, b, 'rating', 'desc'))).toEqual([
      high,
      low,
    ])
  })

  it('inverse le critère actif au second clic', () => {
    expect([low, high].sort((a, b) => compareBottles(a, b, 'name', 'asc'))).toEqual([
      high,
      low,
    ])
    expect([low, high].sort((a, b) => compareBottles(a, b, 'name', 'desc'))).toEqual([
      low,
      high,
    ])
  })

  it('garde les valeurs absentes à la fin dans les deux directions', () => {
    expect([unknown, high].sort((a, b) => compareBottles(a, b, 'rating', 'asc'))).toEqual([
      high,
      unknown,
    ])
    expect([unknown, high].sort((a, b) => compareBottles(a, b, 'rating', 'desc'))).toEqual([
      high,
      unknown,
    ])
  })

  it('départage les égalités par emplacement puis identifiant', () => {
    const first = bottle('z', 3, 'Même nom', 4)
    const second = bottle('a', 4, 'Même nom', 4)
    expect([second, first].sort((a, b) => compareBottles(a, b, 'rating', 'desc'))).toEqual([
      first,
      second,
    ])
  })
})
