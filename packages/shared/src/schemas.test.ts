import { describe, expect, it } from 'vitest'
import { createBottleSchema, createRackSchema, drinkBottleSchema, wineDataSchema } from './schemas.js'

/**
 * Régression du bug 400 à l'ajout d'une bouteille.
 *
 * Un `<input type="number">` vidé renvoie la chaîne vide, et le modificateur `.number`
 * de Vue la laisse passer telle quelle. Effacer le prix d'achat ou le millésime — deux
 * champs pourtant facultatifs — provoquait donc un 400 incompréhensible pour l'utilisateur.
 */

const wine = {
  name: 'Chablis',
  producer: 'Domaine William Fèvre',
  vintage: 2019,
  color: 'WHITE' as const,
  country: 'France',
  region: 'Chablis',
  appellation: 'Chablis',
  grapes: ['Chardonnay'],
  abv: 12.5,
  description: null,
  producerUrl: null,
  imageUrl: 'https://images.vivino.com/thumbs/x.png',
  vivinoUrl: 'https://www.vivino.com/FR/fr/x/w/1',
  vivinoRating: 3.9,
  vivinoRatingCount: 10909,
  priceAvg: 25,
  structure: { acidity: 4, tannin: 0, sweetness: 1, intensity: 3, fizziness: null },
  flavors: [],
  foodTags: ['shellfish'],
  source: 'VIVINO' as const,
}

const bottle = {
  wine,
  rackId: 'rack-1',
  slotNumber: 27,
  personalNote: null,
  purchasePrice: null,
  labelPhotoPath: null,
}

describe('createBottleSchema — champs numériques vidés', () => {
  it('accepte un prix d’achat vidé par l’utilisateur', () => {
    const result = createBottleSchema.safeParse({ ...bottle, purchasePrice: '' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.purchasePrice).toBeNull()
  })

  it('accepte un millésime vidé par l’utilisateur', () => {
    const result = createBottleSchema.safeParse({
      ...bottle,
      wine: { ...wine, vintage: '' },
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.wine.vintage).toBeNull()
  })

  it('accepte un profil gustatif partiellement vidé', () => {
    const result = createBottleSchema.safeParse({
      ...bottle,
      wine: {
        ...wine,
        structure: { acidity: '', tannin: '', sweetness: 1, intensity: 3, fizziness: null },
      },
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.wine.structure.acidity).toBeNull()
  })

  it('convertit une saisie numérique textuelle', () => {
    const result = createBottleSchema.safeParse({ ...bottle, purchasePrice: '24.90' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.purchasePrice).toBe(24.9)
  })

  it('accepte la virgule décimale, usuelle en France', () => {
    const result = createBottleSchema.safeParse({ ...bottle, purchasePrice: '24,90' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.purchasePrice).toBe(24.9)
  })

  it('ramène une saisie ininterprétable à null plutôt que d’échouer', () => {
    const result = createBottleSchema.safeParse({ ...bottle, purchasePrice: 'abc' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.purchasePrice).toBeNull()
  })
})

describe('createBottleSchema — ce qui doit rester refusé', () => {
  it('refuse un nom de vin vide', () => {
    // Le formulaire doit l'attraper avant l'envoi, mais le serveur reste la source de vérité.
    const result = createBottleSchema.safeParse({ ...bottle, wine: { ...wine, name: '' } })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['wine', 'name'])
  })

  it('refuse un emplacement manquant', () => {
    const { slotNumber: _omitted, ...withoutSlot } = bottle
    expect(createBottleSchema.safeParse(withoutSlot).success).toBe(false)
  })

  it('refuse un millésime hors bornes', () => {
    const result = createBottleSchema.safeParse({ ...bottle, wine: { ...wine, vintage: 1200 } })
    expect(result.success).toBe(false)
  })

  it('refuse un prix négatif', () => {
    expect(createBottleSchema.safeParse({ ...bottle, purchasePrice: -5 }).success).toBe(false)
  })
})

describe('drinkBottleSchema', () => {
  it('accepte une note non renseignée', () => {
    const result = drinkBottleSchema.safeParse({ personalRating: '', personalNote: 'Très bien' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.personalRating).toBeNull()
  })
})

describe('wineDataSchema', () => {
  it('applique les valeurs par défaut sur une fiche minimale', () => {
    const result = wineDataSchema.safeParse({ name: 'Vin de table', source: 'MANUAL' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.foodTags).toEqual([])
      expect(result.data.grapes).toEqual([])
      expect(result.data.vintage).toBeNull()
      expect(result.data.structure.tannin).toBeNull()
    }
  })
})

describe('createRackSchema — champs obligatoires vidés', () => {
  /**
   * Même classe de bug que le prix d'achat, sur un champ cette fois obligatoire :
   * vider « Rangées » doit produire un message lisible, pas un « Expected number ».
   */
  it('refuse une dimension vide avec un message compréhensible', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', rows: '', cols: 10 })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toBe(
      'Indique le nombre de rangées (1 à 30).',
    )
  })

  it('accepte une saisie numérique textuelle', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', rows: '6', cols: '10' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.rows).toBe(6)
  })

  it('conserve les bornes de dimension', () => {
    expect(createRackSchema.safeParse({ name: 'Cave', rows: 99, cols: 10 }).success).toBe(false)
    expect(createRackSchema.safeParse({ name: 'Cave', rows: 0, cols: 10 }).success).toBe(false)
  })

  it('refuse un emplacement vide à l’ajout d’une bouteille', () => {
    const result = createBottleSchema.safeParse({
      wine: { name: 'X', source: 'MANUAL' },
      rackId: 'r',
      slotNumber: '',
    })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toContain('emplacement')
  })
})
