import { describe, expect, it } from 'vitest'
import {
  MAX_BOTTLES_PER_ADD,
  MAX_BOTTLES_PER_DRINK,
  MAX_RACK_SIDE,
  MAX_SLOT_NUMBER,
  createBottleSchema,
  createRackSchema,
  drinkBottleSchema,
  drinkBottlesSchema,
  sommelierResponseSchema,
  sommelierStatusSchema,
  updateBottleSchema,
  updateSlotNumberSchema,
  wineDataSchema,
} from './schemas.js'

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

describe('createBottleSchema — ajout de plusieurs exemplaires', () => {
  it('accepte plusieurs emplacements uniques dans un même casier', () => {
    const { slotNumber: _slotNumber, ...common } = bottle
    const result = createBottleSchema.safeParse({ ...common, slotNumbers: [12, 14, 20, 21] })

    expect(result.success).toBe(true)
    expect(result.success && result.data.slotNumbers).toEqual([12, 14, 20, 21])
  })

  it('conserve le contrat historique avec un seul slotNumber', () => {
    const result = createBottleSchema.safeParse(bottle)

    expect(result.success).toBe(true)
    expect(result.success && result.data.slotNumber).toBe(27)
  })

  it('refuse de mélanger les contrats unitaire et multiple', () => {
    const result = createBottleSchema.safeParse({ ...bottle, slotNumbers: [12, 14] })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['slotNumbers'])
  })

  it('refuse les doublons au lieu de les ignorer silencieusement', () => {
    const { slotNumber: _slotNumber, ...common } = bottle
    const result = createBottleSchema.safeParse({ ...common, slotNumbers: [12, 14, 12] })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'ne peut être sélectionné qu’une fois',
    )
  })

  it('refuse un lot vide ou supérieur à la limite', () => {
    const { slotNumber: _slotNumber, ...common } = bottle

    expect(createBottleSchema.safeParse({ ...common, slotNumbers: [] }).success).toBe(false)
    expect(
      createBottleSchema.safeParse({
        ...common,
        slotNumbers: Array.from({ length: MAX_BOTTLES_PER_ADD + 1 }, (_, index) => index),
      }).success,
    ).toBe(false)
  })

  it('refuse une requête sans aucune forme d’emplacement', () => {
    const { slotNumber: _slotNumber, ...common } = bottle

    expect(createBottleSchema.safeParse(common).success).toBe(false)
  })

  it('refuse les chaînes vides sans les convertir silencieusement en emplacement 0', () => {
    const { slotNumber: _slotNumber, ...common } = bottle
    const result = createBottleSchema.safeParse({ ...common, slotNumbers: ['   '] })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toBe(
      'Indique le numéro d’emplacement.',
    )
  })

  it('retourne des erreurs françaises pour la forme et les bornes du lot', () => {
    const { slotNumber: _slotNumber, ...common } = bottle
    const wrongShape = createBottleSchema.safeParse({ ...common, slotNumbers: '12' })
    const belowMinimum = createBottleSchema.safeParse({ ...common, slotNumbers: [-1] })
    const aboveMaximum = createBottleSchema.safeParse({
      ...common,
      slotNumbers: [MAX_SLOT_NUMBER + 1],
    })

    expect(wrongShape.success === false && wrongShape.error.issues[0]?.message).toBe(
      'Indique une liste de numéros d’emplacements.',
    )
    expect(belowMinimum.success === false && belowMinimum.error.issues[0]?.message).toBe(
      'Le numéro d’emplacement doit être positif ou nul.',
    )
    expect(aboveMaximum.success === false && aboveMaximum.error.issues[0]?.message).toContain(
      'ne peut pas dépasser',
    )
  })
})

describe('drinkBottleSchema', () => {
  it('accepte une note non renseignée', () => {
    const result = drinkBottleSchema.safeParse({ personalRating: '', personalNote: 'Très bien' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.personalRating).toBeNull()
  })
})

describe('drinkBottlesSchema', () => {
  it('accepte de 1 à 100 identifiants uniques avec une dégustation commune', () => {
    const result = drinkBottlesSchema.safeParse({
      bottleIds: ['bottle-15', 'bottle-17'],
      personalRating: 4,
      personalNote: 'Ouvertes ensemble',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.bottleIds).toEqual(['bottle-15', 'bottle-17'])
  })

  it('refuse un lot vide, trop grand ou contenant deux fois le même identifiant', () => {
    expect(drinkBottlesSchema.safeParse({ bottleIds: [] }).success).toBe(false)
    expect(
      drinkBottlesSchema.safeParse({
        bottleIds: Array.from(
          { length: MAX_BOTTLES_PER_DRINK + 1 },
          (_, index) => `bottle-${index}`,
        ),
      }).success,
    ).toBe(false)
    expect(
      drinkBottlesSchema.safeParse({ bottleIds: ['bottle-15', 'bottle-15'] }).success,
    ).toBe(false)
  })
})

describe('updateBottleSchema', () => {
  it('accepte explicitement une note de dégustation nullable pour pouvoir l’effacer', () => {
    const result = updateBottleSchema.safeParse({ personalRating: null, personalNote: null })

    expect(result.success).toBe(true)
    expect(result.success && result.data).toMatchObject({
      personalRating: null,
      personalNote: null,
    })
  })

  it('refuse une note de dégustation hors de 1 à 5', () => {
    expect(updateBottleSchema.safeParse({ personalRating: 0 }).success).toBe(false)
    expect(updateBottleSchema.safeParse({ personalRating: 6 }).success).toBe(false)
  })
})

describe('schémas sommelier groupés par vin', () => {
  it('distingue explicitement flag, configuration et quota', () => {
    expect(
      sommelierStatusSchema.parse({
        featureEnabled: false,
        configured: true,
        dailyQuota: 3,
        remaining: 2,
        maxPromptLength: 250,
      }),
    ).toMatchObject({ featureEnabled: false, configured: true, remaining: 2 })
  })

  it('accepte une recommandation par wineId avec tous ses emplacements', () => {
    const result = sommelierResponseSchema.safeParse({
      recommendations: [
        {
          wineId: 'wine-1',
          representativeBottleId: 'bottle-15',
          label: 'Domaine Exemple 2020',
          reason: 'Accord équilibré.',
          locations: [
            {
              bottleId: 'bottle-15',
              rackId: 'rack-1',
              rackName: 'Cave',
              slotNumber: 15,
            },
            {
              bottleId: 'bottle-sans-slot',
              rackId: null,
              rackName: null,
              slotNumber: null,
            },
          ],
        },
      ],
      note: null,
      quotaRemaining: 2,
    })

    expect(result.success).toBe(true)
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
      `Indique le nombre de rangées (1 à ${MAX_RACK_SIDE}).`,
    )
  })

  it('accepte une saisie numérique textuelle', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', rows: '6', cols: '10' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.rows).toBe(6)
  })

  it('conserve les bornes de dimension', () => {
    expect(createRackSchema.safeParse({ name: 'Cave', rows: 0, cols: 10 }).success).toBe(false)
    expect(
      createRackSchema.safeParse({ name: 'Cave', rows: MAX_RACK_SIDE + 1, cols: 10 }).success,
    ).toBe(false)
  })

  /**
   * Une cave n'a pas de taille standard : un mur entier doit passer. La seule limite est
   * celle qui protège la base et le rendu.
   */
  it('accepte un grand casier sous le plafond global', () => {
    expect(createRackSchema.safeParse({ name: 'Cave', rows: 40, cols: 60 }).success).toBe(true)
  })

  it('refuse un casier au-delà du plafond global', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', rows: 100, cols: 200 })

    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'ne peut pas dépasser',
    )
  })
})

describe('updateSlotNumberSchema', () => {
  /**
   * Les caves réelles sont mal étiquetées : un casier de six alvéoles numérotées
   * 1, 2, 3, 100, 5, 6 doit être représentable.
   */
  it('accepte un numéro hors de la suite du casier', () => {
    expect(updateSlotNumberSchema.safeParse({ number: 100 }).success).toBe(true)
  })

  it('accepte une saisie textuelle venue d’un input number', () => {
    const result = updateSlotNumberSchema.safeParse({ number: '100' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.number).toBe(100)
  })

  it('refuse un numéro négatif ou décimal', () => {
    expect(updateSlotNumberSchema.safeParse({ number: -1 }).success).toBe(false)
    expect(updateSlotNumberSchema.safeParse({ number: 1.5 }).success).toBe(false)
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
