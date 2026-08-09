/** Couleurs de vin. Les valeurs sont persistées en base — ne pas renommer sans migration. */
export const WINE_COLORS = ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'FORTIFIED', 'DESSERT'] as const
export type WineColor = (typeof WINE_COLORS)[number]

export const WINE_COLOR_LABELS: Record<WineColor, string> = {
  RED: 'Rouge',
  WHITE: 'Blanc',
  ROSE: 'Rosé',
  SPARKLING: 'Effervescent',
  FORTIFIED: 'Vin muté',
  DESSERT: 'Liquoreux',
}

/** Teintes utilisées pour le verre des bouteilles dans la vue casier. */
export const WINE_COLOR_HEX: Record<WineColor, string> = {
  RED: '#6b1730',
  WHITE: '#d9c87a',
  ROSE: '#e8a1a1',
  SPARKLING: '#e5c869',
  FORTIFIED: '#7a3b1f',
  DESSERT: '#c9962f',
}

export const BOTTLE_STATUSES = ['IN_CELLAR', 'DRUNK'] as const
export type BottleStatus = (typeof BOTTLE_STATUSES)[number]

export const WINE_SOURCES = ['VIVINO', 'OPENFOODFACTS', 'XWINES', 'MANUAL'] as const
export type WineSource = (typeof WINE_SOURCES)[number]

export const RACK_NUMBERINGS = ['ROW_MAJOR', 'COL_MAJOR'] as const
export type RackNumbering = (typeof RACK_NUMBERINGS)[number]

export const USER_ROLES = ['ADMIN', 'USER'] as const
export type UserRole = (typeof USER_ROLES)[number]

/** Axes du profil gustatif, notés 0-5. Repris de la structure Vivino. */
export const STRUCTURE_AXES = ['acidity', 'tannin', 'sweetness', 'intensity', 'fizziness'] as const
export type StructureAxis = (typeof STRUCTURE_AXES)[number]

export const STRUCTURE_LABELS: Record<StructureAxis, string> = {
  acidity: 'Acidité',
  tannin: 'Tanins',
  sweetness: 'Sucrosité',
  intensity: 'Intensité',
  fizziness: 'Effervescence',
}

/** Limite dure du prompt sommelier, appliquée côté client ET revalidée côté serveur. */
export const AI_PROMPT_MAX_LENGTH = 250

export const FEATURE_FLAGS = {
  AI_SOMMELIER: 'ai_sommelier',
} as const
