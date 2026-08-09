import { FOOD_TAGS, type WineColor, type WineData, type WineStructure } from '@cave/shared'

/**
 * Accords et profil déduits du cépage, de la couleur et de la région.
 *
 * Sert de filet quand Vivino est indisponible (circuit ouvert, IP bloquée) ou quand la fiche
 * récupérée ne porte aucun accord. C'est de la connaissance œnologique classique, embarquée :
 * aucune dépendance réseau, aucun dataset à télécharger, disponible à 100 %.
 *
 * Le dataset X-Wines n'est plus distribué librement dans son dépôt (seul un échantillon de
 * 100 vins l'est encore, la version Slim étant passée sur Kaggle derrière un compte) : ces
 * règles le remplacent avantageusement pour notre usage.
 */

interface GrapeProfile {
  foodTags: string[]
  structure: Partial<WineStructure>
}

/** Clés normalisées (minuscules, sans accent) — voir `normalizeGrape`. */
const GRAPE_PROFILES: Record<string, GrapeProfile> = {
  'cabernet sauvignon': {
    foodTags: ['beef', 'lamb', 'game', 'hard-cheese', 'bbq'],
    structure: { tannin: 4.5, acidity: 3.5, intensity: 4.5, sweetness: 1 },
  },
  'cabernet franc': {
    foodTags: ['beef', 'poultry', 'cured-meat', 'mushrooms'],
    structure: { tannin: 3.5, acidity: 3.5, intensity: 3.5, sweetness: 1 },
  },
  merlot: {
    foodTags: ['beef', 'poultry', 'pasta', 'mild-cheese'],
    structure: { tannin: 3, acidity: 3, intensity: 3.5, sweetness: 1.2 },
  },
  'pinot noir': {
    foodTags: ['poultry', 'game', 'mushrooms', 'rich-fish', 'mild-cheese'],
    structure: { tannin: 2, acidity: 4, intensity: 3, sweetness: 1 },
  },
  syrah: {
    foodTags: ['beef', 'lamb', 'game', 'bbq', 'spicy-food'],
    structure: { tannin: 4, acidity: 3.5, intensity: 4.5, sweetness: 1 },
  },
  shiraz: {
    foodTags: ['beef', 'lamb', 'game', 'bbq', 'spicy-food'],
    structure: { tannin: 4, acidity: 3.5, intensity: 4.5, sweetness: 1 },
  },
  grenache: {
    foodTags: ['lamb', 'bbq', 'cured-meat', 'spicy-food'],
    structure: { tannin: 3, acidity: 3, intensity: 4, sweetness: 1.5 },
  },
  mourvedre: {
    foodTags: ['game', 'beef', 'cured-meat'],
    structure: { tannin: 4, acidity: 3, intensity: 4.5, sweetness: 1 },
  },
  malbec: {
    foodTags: ['beef', 'bbq', 'lamb'],
    structure: { tannin: 4, acidity: 3, intensity: 4.5, sweetness: 1.2 },
  },
  tempranillo: {
    foodTags: ['lamb', 'cured-meat', 'hard-cheese', 'beef'],
    structure: { tannin: 3.5, acidity: 3.5, intensity: 4, sweetness: 1 },
  },
  sangiovese: {
    foodTags: ['pasta', 'beef', 'hard-cheese'],
    structure: { tannin: 3.5, acidity: 4.5, intensity: 3.5, sweetness: 1 },
  },
  nebbiolo: {
    foodTags: ['beef', 'game', 'mushrooms', 'hard-cheese'],
    structure: { tannin: 5, acidity: 4.5, intensity: 4.5, sweetness: 1 },
  },
  gamay: {
    foodTags: ['cured-meat', 'poultry', 'mild-cheese'],
    structure: { tannin: 1.5, acidity: 4, intensity: 2.5, sweetness: 1 },
  },
  chardonnay: {
    foodTags: ['rich-fish', 'shellfish', 'poultry', 'pasta', 'mild-cheese'],
    structure: { acidity: 3, intensity: 3.5, sweetness: 1.5 },
  },
  'sauvignon blanc': {
    foodTags: ['lean-fish', 'shellfish', 'goat-cheese', 'vegetarian', 'aperitif'],
    structure: { acidity: 4.5, intensity: 2.5, sweetness: 1 },
  },
  riesling: {
    foodTags: ['asian-food', 'spicy-food', 'lean-fish', 'pork'],
    structure: { acidity: 4.5, intensity: 2.5, sweetness: 2.5 },
  },
  chenin: {
    foodTags: ['lean-fish', 'poultry', 'goat-cheese', 'aperitif'],
    structure: { acidity: 4, intensity: 3, sweetness: 2.5 },
  },
  'chenin blanc': {
    foodTags: ['lean-fish', 'poultry', 'goat-cheese', 'aperitif'],
    structure: { acidity: 4, intensity: 3, sweetness: 2.5 },
  },
  viognier: {
    foodTags: ['poultry', 'rich-fish', 'asian-food'],
    structure: { acidity: 2.5, intensity: 4, sweetness: 2 },
  },
  gewurztraminer: {
    foodTags: ['asian-food', 'spicy-food', 'blue-cheese'],
    structure: { acidity: 2, intensity: 4, sweetness: 3 },
  },
  semillon: {
    foodTags: ['blue-cheese', 'fruity-dessert', 'rich-fish'],
    structure: { acidity: 3, intensity: 3.5, sweetness: 3.5 },
  },
  muscadet: {
    foodTags: ['shellfish', 'lean-fish', 'aperitif'],
    structure: { acidity: 4.5, intensity: 2, sweetness: 0.5 },
  },
  'pinot gris': {
    foodTags: ['pork', 'poultry', 'asian-food', 'mild-cheese'],
    structure: { acidity: 3, intensity: 3, sweetness: 2 },
  },
  'grenache blanc': {
    foodTags: ['lean-fish', 'poultry', 'vegetarian'],
    structure: { acidity: 3, intensity: 3, sweetness: 1.5 },
  },
}

/** Régions dont le style est suffisamment marqué pour porter des accords à elles seules. */
const REGION_PROFILES: Record<string, GrapeProfile> = {
  chablis: { foodTags: ['shellfish', 'lean-fish', 'goat-cheese'], structure: { acidity: 4.5, intensity: 2.5 } },
  sancerre: { foodTags: ['goat-cheese', 'lean-fish', 'shellfish'], structure: { acidity: 4.5, intensity: 2.5 } },
  champagne: { foodTags: ['aperitif', 'shellfish', 'lean-fish'], structure: { acidity: 4.5, fizziness: 5 } },
  sauternes: { foodTags: ['blue-cheese', 'fruity-dessert'], structure: { sweetness: 5, acidity: 3.5 } },
  bordeaux: { foodTags: ['beef', 'lamb', 'hard-cheese'], structure: { tannin: 4, acidity: 3.5, intensity: 4 } },
  medoc: { foodTags: ['beef', 'lamb', 'hard-cheese'], structure: { tannin: 4.5, acidity: 3.5, intensity: 4 } },
  margaux: { foodTags: ['beef', 'lamb', 'game'], structure: { tannin: 4, acidity: 3.5, intensity: 4 } },
  pomerol: { foodTags: ['beef', 'poultry', 'mushrooms'], structure: { tannin: 3.5, acidity: 3, intensity: 4 } },
  bourgogne: { foodTags: ['poultry', 'mushrooms', 'game'], structure: { tannin: 2, acidity: 4, intensity: 3 } },
  beaujolais: { foodTags: ['cured-meat', 'poultry'], structure: { tannin: 1.5, acidity: 4, intensity: 2.5 } },
  'cotes du rhone': { foodTags: ['bbq', 'lamb', 'cured-meat'], structure: { tannin: 3.5, acidity: 3, intensity: 4 } },
  chateauneuf: { foodTags: ['game', 'lamb', 'beef'], structure: { tannin: 3.5, acidity: 3, intensity: 4.5 } },
  alsace: { foodTags: ['pork', 'asian-food', 'lean-fish'], structure: { acidity: 4, sweetness: 2.5 } },
  provence: { foodTags: ['aperitif', 'lean-fish', 'vegetarian'], structure: { acidity: 3.5, intensity: 2 } },
  chianti: { foodTags: ['pasta', 'beef', 'hard-cheese'], structure: { tannin: 3.5, acidity: 4.5, intensity: 3.5 } },
  rioja: { foodTags: ['lamb', 'cured-meat', 'beef'], structure: { tannin: 3.5, acidity: 3.5, intensity: 4 } },
  porto: { foodTags: ['chocolate', 'blue-cheese', 'fruity-dessert'], structure: { sweetness: 4.5, intensity: 5 } },
}

/** Accords minimaux garantis par couleur, pour n'être jamais totalement démuni. */
const COLOR_DEFAULTS: Record<WineColor, GrapeProfile> = {
  RED: { foodTags: ['beef', 'hard-cheese'], structure: { tannin: 3, acidity: 3, intensity: 3.5 } },
  WHITE: { foodTags: ['lean-fish', 'poultry'], structure: { acidity: 3.5, intensity: 2.5, tannin: 0 } },
  ROSE: { foodTags: ['aperitif', 'vegetarian'], structure: { acidity: 3.5, intensity: 2, tannin: 0.5 } },
  SPARKLING: { foodTags: ['aperitif', 'shellfish'], structure: { acidity: 4, fizziness: 4.5, tannin: 0 } },
  FORTIFIED: { foodTags: ['chocolate', 'blue-cheese'], structure: { sweetness: 4, intensity: 5 } },
  DESSERT: { foodTags: ['fruity-dessert', 'blue-cheese'], structure: { sweetness: 4.5, acidity: 3 } },
}

/**
 * Les slugs de ces tables doivent exister dans le référentiel partagé, sinon on produirait
 * des accords que la recherche ne saurait jamais retrouver. Validé contre FOOD_TAGS, pas
 * contre les tables elles-mêmes — une faute de frappe doit être détectable.
 */
const VALID_FOOD_SLUGS = new Set(FOOD_TAGS.map((t) => t.slug))

export function findUnknownHeuristicSlugs(): string[] {
  const unknown = new Set<string>()
  for (const profile of [
    ...Object.values(GRAPE_PROFILES),
    ...Object.values(REGION_PROFILES),
    ...Object.values(COLOR_DEFAULTS),
  ]) {
    for (const tag of profile.foodTags) {
      if (!VALID_FOOD_SLUGS.has(tag)) unknown.add(tag)
    }
  }
  return [...unknown]
}

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function lookup(table: Record<string, GrapeProfile>, needle: string): GrapeProfile | undefined {
  const normalized = normalize(needle)
  if (!normalized) return undefined
  if (table[normalized]) return table[normalized]
  // « Côtes du Rhône Villages » doit matcher « cotes du rhone ».
  for (const [key, profile] of Object.entries(table)) {
    if (normalized.includes(key)) return profile
  }
  return undefined
}

export interface Enrichment {
  foodTags: string[]
  structure: WineStructure
}

/**
 * Calcule accords et profil pour un vin. Les sources sont combinées par priorité
 * décroissante : cépages > région > couleur.
 */
export function deriveEnrichment(input: {
  grapes?: string[]
  region?: string | null
  appellation?: string | null
  color?: WineColor | null
}): Enrichment {
  const foodTags = new Set<string>()
  const structure: WineStructure = {
    acidity: null,
    tannin: null,
    sweetness: null,
    intensity: null,
    fizziness: null,
  }

  const apply = (profile: GrapeProfile | undefined) => {
    if (!profile) return
    for (const tag of profile.foodTags) {
      if (VALID_FOOD_SLUGS.has(tag)) foodTags.add(tag)
    }
    for (const [axis, value] of Object.entries(profile.structure)) {
      const key = axis as keyof WineStructure
      // Premier renseigné gagne : les cépages sont appliqués avant la région.
      if (structure[key] === null && typeof value === 'number') structure[key] = value
    }
  }

  for (const grape of input.grapes ?? []) apply(lookup(GRAPE_PROFILES, grape))
  apply(lookup(REGION_PROFILES, input.appellation ?? ''))
  apply(lookup(REGION_PROFILES, input.region ?? ''))
  if (input.color) apply(COLOR_DEFAULTS[input.color])

  return { foodTags: [...foodTags], structure }
}

/**
 * Complète une fiche sans jamais écraser une donnée provenant d'un vrai provider :
 * une note ou un accord venus de Vivino restent prioritaires.
 */
export function enrichWineData(wine: WineData): WineData {
  const derived = deriveEnrichment({
    grapes: wine.grapes,
    region: wine.region,
    appellation: wine.appellation,
    color: wine.color,
  })

  const structure = { ...wine.structure }
  for (const axis of Object.keys(structure) as (keyof WineStructure)[]) {
    if (structure[axis] === null) structure[axis] = derived.structure[axis]
  }

  return {
    ...wine,
    structure,
    foodTags: wine.foodTags.length > 0 ? wine.foodTags : derived.foodTags,
  }
}
