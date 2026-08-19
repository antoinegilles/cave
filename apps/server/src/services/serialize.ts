import type { WineData, WineStructure } from '@cave/shared'
import { getFoodTag } from '@cave/shared'

/** Formes Prisma minimales attendues — évite d'importer les types générés partout. */
interface WineRow {
  id: string
  name: string
  producer: string | null
  vintage: number | null
  color: string | null
  country: string | null
  region: string | null
  appellation: string | null
  grapes: string
  abv: number | null
  description: string | null
  producerUrl: string | null
  imageUrl: string | null
  vivinoId: string | null
  vivinoUrl: string | null
  vivinoRating: number | null
  vivinoRatingCount: number | null
  priceAvg: number | null
  structure: string
  flavors: string
  source: string
  foodTags?: { foodTag: { slug: string; labelFr: string; emoji: string } }[]
}

interface BottleRow {
  id: string
  status: string
  addedAt: Date
  drunkAt: Date | null
  personalNote: string | null
  personalRating: number | null
  purchasePrice: number | null
  labelPhotoPath: string | null
  ownerLabel: string | null
  wine: WineRow
  slot?: { id: string; number: number; rackId: string; rack?: { name: string } } | null
}

/** SQLite n'a pas de type JSON : les colonnes Json sont du TEXT qu'il faut parser défensivement. */
function parseJson<T>(raw: string, fallback: T): T {
  try {
    const value = JSON.parse(raw)
    return (value ?? fallback) as T
  } catch {
    return fallback
  }
}

const EMPTY_STRUCTURE: WineStructure = {
  acidity: null,
  tannin: null,
  sweetness: null,
  intensity: null,
  fizziness: null,
}

export function serializeWine(wine: WineRow) {
  return {
    id: wine.id,
    name: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    color: wine.color,
    country: wine.country,
    region: wine.region,
    appellation: wine.appellation,
    grapes: parseJson<string[]>(wine.grapes, []),
    abv: wine.abv,
    description: wine.description,
    producerUrl: wine.producerUrl,
    imageUrl: wine.imageUrl,
    vivinoUrl: wine.vivinoUrl,
    vivinoRating: wine.vivinoRating,
    vivinoRatingCount: wine.vivinoRatingCount,
    priceAvg: wine.priceAvg,
    structure: { ...EMPTY_STRUCTURE, ...parseJson<Partial<WineStructure>>(wine.structure, {}) },
    flavors: parseJson<string[]>(wine.flavors, []),
    source: wine.source,
    foodTags: (wine.foodTags ?? []).map((ft) => ft.foodTag),
  }
}

/**
 * Hydrate une fiche fraîchement récupérée chez un provider pour l'envoyer au front.
 *
 * Deux formes de `foodTags` circulaient sous le même nom `wine` : les fiches en base
 * passent par `serializeWine` et sortent en objets `{ slug, labelFr, emoji }`, tandis que
 * les providers ne produisent que des slugs. Le front n'en connaît qu'une — il affiche
 * `food.emoji` et renvoie `f.slug` à l'ajout. Sur des chaînes, les puces d'accords
 * sortaient vides puis `POST /api/bottles` échouait en 400, `f.slug` valant `undefined`.
 *
 * Les slugs absents du référentiel sont écartés : c'est déjà ce que fait `syncFoodTags`
 * à l'écriture, autant ne pas afficher un accord qu'on ne saurait pas persister.
 */
export function serializeWineData(wine: WineData) {
  return {
    ...wine,
    foodTags: wine.foodTags.flatMap((slug) => {
      const tag = getFoodTag(slug)
      return tag ? [{ slug: tag.slug, labelFr: tag.labelFr, emoji: tag.emoji }] : []
    }),
  }
}

export function serializeBottle(bottle: BottleRow) {
  return {
    id: bottle.id,
    status: bottle.status,
    addedAt: bottle.addedAt.toISOString(),
    drunkAt: bottle.drunkAt?.toISOString() ?? null,
    personalNote: bottle.personalNote,
    personalRating: bottle.personalRating,
    purchasePrice: bottle.purchasePrice,
    labelPhotoPath: bottle.labelPhotoPath,
    ownerLabel: bottle.ownerLabel,
    slotNumber: bottle.slot?.number ?? null,
    rackId: bottle.slot?.rackId ?? null,
    rackName: bottle.slot?.rack?.name ?? null,
    wine: serializeWine(bottle.wine),
  }
}
