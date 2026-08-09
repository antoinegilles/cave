import { getFoodTag } from '@cave/shared'
import { describe, expect, it } from 'vitest'
import { deriveEnrichment, enrichWineData, findUnknownHeuristicSlugs } from './heuristics.js'

describe('tables heuristiques', () => {
  it('n’utilise que des slugs présents dans le référentiel partagé', () => {
    // Un slug inconnu produirait un accord que la recherche ne retrouverait jamais.
    expect(findUnknownHeuristicSlugs()).toEqual([])
  })

  it('expose des slugs résolvables en libellé français', () => {
    const { foodTags } = deriveEnrichment({ grapes: ['Cabernet Sauvignon'] })
    for (const slug of foodTags) {
      expect(getFoodTag(slug), `slug inconnu : ${slug}`).toBeDefined()
    }
  })
})

describe('deriveEnrichment', () => {
  it('déduit des accords carnés d’un cabernet sauvignon', () => {
    const { foodTags, structure } = deriveEnrichment({ grapes: ['Cabernet Sauvignon'] })

    expect(foodTags).toContain('beef')
    expect(foodTags).toContain('lamb')
    expect(structure.tannin).toBeGreaterThan(4)
  })

  it('déduit des accords marins d’un chablis', () => {
    const { foodTags, structure } = deriveEnrichment({ region: 'Chablis', color: 'WHITE' })

    expect(foodTags).toContain('shellfish')
    expect(foodTags).toContain('lean-fish')
    expect(structure.acidity).toBeGreaterThan(4)
  })

  it('reconnaît une appellation composée', () => {
    const { foodTags } = deriveEnrichment({ region: 'Côtes du Rhône Villages', color: 'RED' })
    expect(foodTags).toContain('bbq')
  })

  it('associe un sauternes au roquefort et aux desserts', () => {
    const { foodTags, structure } = deriveEnrichment({ region: 'Sauternes', color: 'DESSERT' })

    expect(foodTags).toContain('blue-cheese')
    expect(foodTags).toContain('fruity-dessert')
    expect(structure.sweetness).toBeGreaterThan(4)
  })

  it('donne toujours au moins un accord quand seule la couleur est connue', () => {
    for (const color of ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'FORTIFIED', 'DESSERT'] as const) {
      expect(deriveEnrichment({ color }).foodTags.length).toBeGreaterThan(0)
    }
  })

  it('ne renvoie rien quand il n’y a rien à déduire', () => {
    expect(deriveEnrichment({}).foodTags).toEqual([])
  })

  it('fait primer le cépage sur la région pour le profil', () => {
    // Nebbiolo (tanin 5) doit l'emporter sur la valeur régionale bourguignonne (2).
    const { structure } = deriveEnrichment({ grapes: ['Nebbiolo'], region: 'Bourgogne' })
    expect(structure.tannin).toBe(5)
  })
})

describe('enrichWineData', () => {
  const base = {
    name: 'Test',
    producer: 'Domaine Test',
    vintage: 2019,
    color: 'RED' as const,
    country: 'France',
    region: 'Margaux',
    appellation: 'Margaux',
    grapes: ['Merlot'],
    abv: 13,
    description: null,
    producerUrl: null,
    imageUrl: null,
    vivinoId: null,
    vivinoUrl: null,
    vivinoRating: null,
    vivinoRatingCount: null,
    priceAvg: null,
    flavors: [],
    source: 'MANUAL' as const,
  }

  it('n’écrase jamais les accords venus d’un vrai provider', () => {
    const result = enrichWineData({
      ...base,
      foodTags: ['chocolate'],
      structure: { acidity: null, tannin: null, sweetness: null, intensity: null, fizziness: null },
    })

    expect(result.foodTags).toEqual(['chocolate'])
  })

  it('complète les accords manquants', () => {
    const result = enrichWineData({
      ...base,
      foodTags: [],
      structure: { acidity: null, tannin: null, sweetness: null, intensity: null, fizziness: null },
    })

    expect(result.foodTags.length).toBeGreaterThan(0)
    expect(result.foodTags).toContain('beef')
  })

  it('ne remplit que les axes de profil laissés vides', () => {
    const result = enrichWineData({
      ...base,
      foodTags: [],
      structure: { acidity: 1.1, tannin: null, sweetness: null, intensity: null, fizziness: null },
    })

    expect(result.structure.acidity).toBe(1.1)
    expect(result.structure.tannin).not.toBeNull()
  })
})
