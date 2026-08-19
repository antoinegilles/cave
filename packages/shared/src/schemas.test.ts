import { describe, expect, it } from 'vitest'
import {
  MAX_BOTTLES_PER_ADD,
  MAX_BOTTLES_PER_DRINK,
  MAX_RACK_SLOTS,
  MAX_SLOT_NUMBER,
  addBottleCopiesSchema,
  createBottleSchema,
  createRackSchema,
  drinkBottleSchema,
  drinkBottlesSchema,
  sommelierResponseSchema,
  sommelierStatusSchema,
  updateBottleSchema,
  wineDataSchema,
} from './schemas.js'

describe('placements multi-bouteilles', () => {
  it('accepte plusieurs bouteilles dans le même emplacement', () => {
    const parsed = createBottleSchema.parse({
      wine,
      placements: [{ rackId: 'rack-1', slotNumber: 1001, quantity: 3 }],
    })
    expect(parsed.placements?.[0]).toMatchObject({ slotNumber: 1001, quantity: 3 })
  })

  it('borne la somme des quantités et refuse un placement répété', () => {
    expect(
      addBottleCopiesSchema.safeParse({
        placements: [
          { rackId: 'rack-1', slotNumber: 1, quantity: MAX_BOTTLES_PER_ADD },
          { rackId: 'rack-1', slotNumber: 1, quantity: 1 },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('propriétaire de la bouteille', () => {
  it('conserve le nom du propriétaire et le rend nul par défaut', () => {
    const named = createBottleSchema.parse({
      wine,
      placements: [{ rackId: 'rack-1', slotNumber: 1, quantity: 1 }],
      ownerLabel: 'Jean Dupont',
    })
    expect(named.ownerLabel).toBe('Jean Dupont')

    const absent = createBottleSchema.parse({
      wine,
      placements: [{ rackId: 'rack-1', slotNumber: 1, quantity: 1 }],
    })
    expect(absent.ownerLabel).toBeNull()
  })

  it('borne la longueur du nom du propriétaire', () => {
    expect(
      createBottleSchema.safeParse({
        wine,
        placements: [{ rackId: 'rack-1', slotNumber: 1, quantity: 1 }],
        ownerLabel: 'x'.repeat(121),
      }).success,
    ).toBe(false)
  })
})

describe('createRackSchema — intervalle de la cave', () => {
  it('accepte un intervalle simple et de grands numéros', () => {
    const result = createRackSchema.safeParse({ name: 'Salon', firstNumber: 10, lastNumber: 200 })
    expect(result.success).toBe(true)
    expect(result.success && result.data).toMatchObject({ firstNumber: 10, lastNumber: 200 })
  })

  it('accepte une saisie numérique textuelle venue d’un input number', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', firstNumber: '1', lastNumber: '60' })
    expect(result.success).toBe(true)
    expect(result.success && result.data.lastNumber).toBe(60)
  })

  it('accepte un intervalle d’un seul emplacement', () => {
    expect(createRackSchema.safeParse({ name: 'Cave', firstNumber: 5, lastNumber: 5 }).success).toBe(
      true,
    )
  })

  it('refuse un dernier numéro inférieur au premier', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', firstNumber: 200, lastNumber: 10 })
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'supérieur ou égal au premier',
    )
  })

  it('refuse un premier numéro vide avec un message lisible', () => {
    const result = createRackSchema.safeParse({ name: 'Cave', firstNumber: '', lastNumber: 60 })
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toContain('premier numéro')
  })

  it('refuse un intervalle au-delà du plafond global', () => {
    const result = createRackSchema.safeParse({
      name: 'Mur entier',
      firstNumber: 0,
      lastNumber: MAX_RACK_SLOTS,
    })
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'ne peut pas dépasser',
    )
  })

  it('accepte un mur entier sous le plafond global', () => {
    expect(
      createRackSchema.safeParse({ name: 'Mur', firstNumber: 1, lastNumber: MAX_RACK_SLOTS })
        .success,
    ).toBe(true)
  })
})

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

describe('createBottleSchema — emplacement', () => {
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
