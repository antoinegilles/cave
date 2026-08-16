import { z } from 'zod'
import {
  AI_PROMPT_MAX_LENGTH,
  BOTTLE_STATUSES,
  RACK_NUMBERINGS,
  WINE_COLORS,
  WINE_SOURCES,
} from './constants.js'

export const wineColorSchema = z.enum(WINE_COLORS)
export const bottleStatusSchema = z.enum(BOTTLE_STATUSES)
export const wineSourceSchema = z.enum(WINE_SOURCES)
export const rackNumberingSchema = z.enum(RACK_NUMBERINGS)

/**
 * Champ numérique facultatif tolérant à la chaîne vide.
 *
 * Un `<input type="number">` vidé par l'utilisateur renvoie `''`, et le modificateur
 * `.number` de Vue laisse passer cette chaîne telle quelle. Sans ce prétraitement,
 * effacer le prix ou le millésime provoquait un 400 « Expected number, received string »
 * sur un champ pourtant facultatif.
 *
 * On normalise donc `''`, `NaN` et `null` vers `null` avant toute validation.
 */
function optionalNumber(schema: z.ZodNumber) {
  return z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'))
      return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return null
    return value
  }, schema.nullable())
}

/**
 * Champ numérique obligatoire, tolérant à une saisie textuelle.
 *
 * Même piège que `optionalNumber` : un `<input type="number">` renvoie une chaîne. Ici le
 * champ est requis, donc une valeur vide doit être refusée — mais avec un message
 * compréhensible plutôt qu'un « Expected number, received string » incompréhensible.
 */
function requiredNumber(message: string) {
  return (build: (base: z.ZodNumber) => z.ZodNumber) =>
    z.preprocess(
      (value) => {
        if (value === '' || value === null || value === undefined) return undefined
        if (typeof value === 'string') {
          const normalized = value.trim()
          if (!normalized) return undefined
          const parsed = Number(normalized.replace(',', '.'))
          return Number.isFinite(parsed) ? parsed : undefined
        }
        return value
      },
      build(z.number({ required_error: message, invalid_type_error: message })),
    )
}

/* ------------------------------------------------------------------ auth */

export const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const createUserSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  name: z.string().min(1).max(80),
  password: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères').max(200),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

/** Inscription publique. Le rôle n'est jamais choisi par le client. */
export const registerSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  name: z.string().min(1, 'Prénom requis').max(80),
  password: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères').max(200),
  inviteCode: z.string().max(100).optional(),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères').max(200),
})

/* ----------------------------------------------------------------- racks */

/**
 * Bornes d'un casier.
 *
 * Il n'y a volontairement pas de « taille standard » : les caves réelles vont de six
 * alvéoles à un mur entier. La seule limite est celle qui protège la base et le rendu —
 * au-delà, ni SQLite ni un téléphone ne suivent. `MAX_RACK_SLOTS` est la vraie contrainte,
 * `MAX_RACK_SIDE` évite seulement les casiers dégénérés de 1 × 10 000.
 */
export const MAX_RACK_SIDE = 200
export const MAX_RACK_SLOTS = 10_000
export const MAX_SLOT_NUMBER = 999_999
/** Un ajout en lot reste volontairement borné pour protéger l'API et l'interface. */
export const MAX_BOTTLES_PER_ADD = 100

const rackShape = {
  name: z.string().min(1, 'Nom requis').max(60),
  rows: requiredNumber(`Indique le nombre de rangées (1 à ${MAX_RACK_SIDE}).`)((n) =>
    n.int().min(1).max(MAX_RACK_SIDE),
  ),
  cols: requiredNumber(`Indique le nombre de colonnes (1 à ${MAX_RACK_SIDE}).`)((n) =>
    n.int().min(1).max(MAX_RACK_SIDE),
  ),
  numbering: rackNumberingSchema.default('ROW_MAJOR'),
  startNumber: requiredNumber('Indique le premier numéro du casier.')((n) =>
    n.int().min(0).max(MAX_SLOT_NUMBER),
  ).default(1),
}

/** `rows × cols` ne doit jamais dépasser le plafond global, quelle que soit la forme. */
function withSlotCap<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (value) => {
      const { rows, cols } = value as { rows?: number; cols?: number }
      if (rows === undefined || cols === undefined) return true
      return rows * cols <= MAX_RACK_SLOTS
    },
    {
      message: `Un casier ne peut pas dépasser ${MAX_RACK_SLOTS.toLocaleString('fr-FR')} emplacements.`,
      path: ['cols'],
    },
  )
}

export const createRackSchema = withSlotCap(z.object(rackShape))
export type CreateRackInput = z.infer<typeof createRackSchema>

export const updateRackSchema = withSlotCap(z.object(rackShape).partial())

/**
 * Renumérotation d'un emplacement.
 *
 * Les numéros n'ont pas à former une suite : un casier de six alvéoles peut très bien être
 * étiqueté 1, 2, 3, 100, 5, 6 si c'est ce qui est écrit sur le meuble. Seule l'unicité au
 * sein du casier est garantie, par la contrainte `@@unique([rackId, number])`.
 */
export const updateSlotNumberSchema = z.object({
  number: requiredNumber('Indique un numéro d’emplacement.')((n) =>
    n.int().min(0).max(MAX_SLOT_NUMBER),
  ),
})
export type UpdateSlotNumberInput = z.infer<typeof updateSlotNumberSchema>

/* ------------------------------------------------------------------ wine */

const structureAxis = () => optionalNumber(z.number().min(0).max(5)).default(null)

export const wineStructureSchema = z.object({
  acidity: structureAxis(),
  tannin: structureAxis(),
  sweetness: structureAxis(),
  intensity: structureAxis(),
  fizziness: structureAxis(),
})
export type WineStructure = z.infer<typeof wineStructureSchema>

/** Forme normalisée renvoyée par tous les providers. */
export const wineDataSchema = z.object({
  name: z.string().min(1).max(200),
  producer: z.string().max(200).nullable().default(null),
  vintage: optionalNumber(z.number().int().min(1800).max(2100)).default(null),
  color: wineColorSchema.nullable().default(null),
  country: z.string().max(80).nullable().default(null),
  region: z.string().max(120).nullable().default(null),
  appellation: z.string().max(120).nullable().default(null),
  grapes: z.array(z.string().max(80)).default([]),
  abv: optionalNumber(z.number().min(0).max(80)).default(null),
  description: z.string().max(4000).nullable().default(null),
  producerUrl: z.string().url().nullable().default(null),
  imageUrl: z.string().url().nullable().default(null),
  vivinoId: z.string().max(40).nullable().default(null),
  vivinoUrl: z.string().url().nullable().default(null),
  vivinoRating: optionalNumber(z.number().min(0).max(5)).default(null),
  vivinoRatingCount: optionalNumber(z.number().int().min(0)).default(null),
  priceAvg: optionalNumber(z.number().min(0)).default(null),
  structure: wineStructureSchema.default({
    acidity: null,
    tannin: null,
    sweetness: null,
    intensity: null,
    fizziness: null,
  }),
  flavors: z.array(z.string().max(60)).default([]),
  /** Slugs canoniques issus de `matchFoodTag`. */
  foodTags: z.array(z.string().max(40)).default([]),
  source: wineSourceSchema,
})
export type WineData = z.infer<typeof wineDataSchema>

/** Résultat de recherche d'un provider, avant récupération de la fiche complète. */
export const candidateSchema = z.object({
  provider: wineSourceSchema,
  ref: z.string().min(1),
  label: z.string().min(1),
  producer: z.string().nullable().default(null),
  vintage: z.number().int().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
  score: z.number().min(0).max(1).default(0),
})
export type Candidate = z.infer<typeof candidateSchema>

/* --------------------------------------------------------------- bottles */

const bottleSlotNumberSchema = requiredNumber('Indique le numéro d’emplacement.')((n) =>
  n
    .int('Le numéro d’emplacement doit être un nombre entier.')
    .min(0, 'Le numéro d’emplacement doit être positif ou nul.')
    .max(
      MAX_SLOT_NUMBER,
      `Le numéro d’emplacement ne peut pas dépasser ${MAX_SLOT_NUMBER.toLocaleString('fr-FR')}.`,
    ),
)

export const createBottleSchema = z
  .object({
    wine: wineDataSchema,
    rackId: z.string().min(1),
    /** Contrat historique, conservé pour les anciens clients. */
    slotNumber: bottleSlotNumberSchema.optional(),
    /** Contrat d'ajout en lot : tous les emplacements appartiennent au même casier. */
    slotNumbers: z
      .array(bottleSlotNumberSchema, {
        invalid_type_error: 'Indique une liste de numéros d’emplacements.',
      })
      .min(1, 'Indique au moins un emplacement.')
      .max(
        MAX_BOTTLES_PER_ADD,
        `Tu peux ajouter au maximum ${MAX_BOTTLES_PER_ADD} bouteilles à la fois.`,
      )
      .optional(),
    personalNote: z.string().max(2000).nullable().default(null),
    purchasePrice: optionalNumber(z.number().min(0).max(100000)).default(null),
    labelPhotoPath: z.string().max(300).nullable().default(null),
  })
  .superRefine((data, ctx) => {
    const hasSingle = data.slotNumber !== undefined
    const hasMany = data.slotNumbers !== undefined

    if (hasSingle === hasMany) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasMany ? ['slotNumbers'] : ['slotNumber'],
        message: 'Indique soit un emplacement, soit une liste d’emplacements.',
      })
    }

    if (data.slotNumbers && new Set(data.slotNumbers).size !== data.slotNumbers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slotNumbers'],
        message: 'Un même emplacement ne peut être sélectionné qu’une fois.',
      })
    }
  })
export type CreateBottleInput = z.infer<typeof createBottleSchema>

export const updateBottleSchema = z.object({
  personalNote: z.string().max(2000).nullable().optional(),
  purchasePrice: optionalNumber(z.number().min(0).max(100000)).optional(),
  rackId: z.string().min(1).optional(),
  slotNumber: z.number().int().min(0).max(MAX_SLOT_NUMBER).optional(),
})

export const drinkBottleSchema = z.object({
  personalRating: optionalNumber(z.number().min(0).max(5)).default(null),
  personalNote: z.string().max(2000).nullable().default(null),
  drunkAt: z.string().datetime().nullable().default(null),
})
export type DrinkBottleInput = z.infer<typeof drinkBottleSchema>

/* ---------------------------------------------------------------- search */

export const searchSchema = z.object({
  q: z.string().max(200).optional(),
  colors: z.array(wineColorSchema).optional(),
  foodTags: z.array(z.string().max(40)).optional(),
  flavors: z.array(z.string().max(60)).optional(),
  regions: z.array(z.string().max(120)).optional(),
  minRating: z.number().min(0).max(5).optional(),
  vintageMin: z.number().int().min(1800).max(2100).optional(),
  vintageMax: z.number().int().min(1800).max(2100).optional(),
  priceMax: z.number().min(0).optional(),
  /** Bornes sur les axes du profil gustatif, ex. { tannin: [3, 5] }. */
  structure: z
    .record(
      z.enum(['acidity', 'tannin', 'sweetness', 'intensity', 'fizziness']),
      z.tuple([z.number().min(0).max(5), z.number().min(0).max(5)]),
    )
    .optional(),
  status: bottleStatusSchema.default('IN_CELLAR'),
  rackId: z.string().optional(),
  sort: z.enum(['slot', 'rating', 'vintage', 'added', 'name']).default('slot'),
  limit: z.number().int().min(1).max(500).default(200),
})
export type SearchInput = z.infer<typeof searchSchema>

/* -------------------------------------------------------------------- ai */

export const sommelierSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(3, 'Décris un peu plus ton repas')
    .max(AI_PROMPT_MAX_LENGTH, `${AI_PROMPT_MAX_LENGTH} caractères maximum`),
})
export type SommelierInput = z.infer<typeof sommelierSchema>

export const sommelierResponseSchema = z.object({
  recommendations: z.array(
    z.object({
      bottleId: z.string(),
      slotNumber: z.number().int().nullable(),
      rackName: z.string().nullable(),
      label: z.string(),
      reason: z.string(),
    }),
  ),
  note: z.string().nullable(),
  quotaRemaining: z.number().int().min(0),
})
export type SommelierResponse = z.infer<typeof sommelierResponseSchema>

/* ------------------------------------------------------------------ scan */

/** Champs extraits d'une photo d'étiquette. Tous nullable : une étiquette peut être illisible. */
export const labelExtractionSchema = z.object({
  producer: z.string().max(200).nullable(),
  cuvee: z.string().max(200).nullable(),
  appellation: z.string().max(200).nullable(),
  vintage: z.number().int().min(1800).max(2100).nullable(),
  color: wineColorSchema.nullable(),
  country: z.string().max(80).nullable(),
})
export type LabelExtraction = z.infer<typeof labelExtractionSchema>
