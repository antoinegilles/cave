import type { WineData } from '@cave/shared'
import { createBottleSchema } from '@cave/shared'
import { describe, expect, it } from 'vitest'
import { serializeWineData } from './serialize.js'

/**
 * Régression du 400 à l'ajout d'une bouteille trouvée par recherche Vivino.
 *
 * Les fiches en base sortent par `serializeWine` avec des accords en objets
 * `{ slug, labelFr, emoji }` ; les providers, eux, ne produisent que des slugs. Les deux
 * circulaient sous le même nom `wine`, et le front n'en connaît qu'une : il affiche
 * `food.emoji` puis renvoie `f.slug` à l'ajout. Sur des chaînes, les puces d'accords
 * sortaient vides et `POST /api/bottles` répondait 400 — `f.slug` valant `undefined`.
 *
 * Ce test rejoue la chaîne complète : fiche provider → hydratation → mapping du front →
 * validation serveur. Il casse si l'une des deux formes diverge à nouveau.
 */

const providerWine: WineData = {
  name: 'Pétrus',
  producer: 'Pétrus',
  vintage: 2015,
  color: 'RED',
  country: 'France',
  region: 'Pomerol',
  appellation: 'Pomerol',
  grapes: ['Merlot'],
  abv: 14,
  description: null,
  producerUrl: null,
  imageUrl: 'https://images.vivino.com/thumbs/exemple.jpg',
  vivinoId: '1166837',
  vivinoUrl: 'https://www.vivino.com/w/1166837',
  vivinoRating: 4.6,
  vivinoRatingCount: 1234,
  priceAvg: 3000,
  structure: { acidity: 3, tannin: 4, sweetness: 1, intensity: 5, fizziness: null },
  flavors: ['truffe', 'cuir'],
  foodTags: ['beef', 'lamb'],
  source: 'VIVINO',
}

/** Reproduit ce que `AddBottleView.vue` construit à la soumission du formulaire. */
function payloadDuFront(wine: ReturnType<typeof serializeWineData>) {
  return {
    wine: { ...wine, foodTags: wine.foodTags.map((f) => f.slug) },
    rackId: 'rack-1',
    slotNumber: 12,
  }
}

describe('serializeWineData', () => {
  it('hydrate les slugs d’accords en objets affichables', () => {
    const wine = serializeWineData(providerWine)

    expect(wine.foodTags).toEqual([
      { slug: 'beef', labelFr: 'Bœuf', emoji: '🥩' },
      { slug: 'lamb', labelFr: 'Agneau', emoji: '🐑' },
    ])
  })

  it('écarte les slugs absents du référentiel', () => {
    const wine = serializeWineData({ ...providerWine, foodTags: ['beef', 'slug-inconnu'] })

    expect(wine.foodTags.map((f) => f.slug)).toEqual(['beef'])
  })

  it('laisse le reste de la fiche intact', () => {
    const wine = serializeWineData(providerWine)

    expect(wine.name).toBe('Pétrus')
    expect(wine.vivinoId).toBe('1166837')
    expect(wine.grapes).toEqual(['Merlot'])
    expect(wine.structure).toEqual(providerWine.structure)
  })
})

describe('contrat provider → front → serveur', () => {
  it('accepte une fiche provider hydratée renvoyée telle quelle par le front', () => {
    const result = createBottleSchema.safeParse(payloadDuFront(serializeWineData(providerWine)))

    expect(result.success).toBe(true)
    expect(result.success && result.data.wine.foodTags).toEqual(['beef', 'lamb'])
  })

  it('sans accord, l’ajout reste possible', () => {
    const wine = serializeWineData({ ...providerWine, foodTags: [] })
    const result = createBottleSchema.safeParse(payloadDuFront(wine))

    expect(result.success).toBe(true)
  })
})
