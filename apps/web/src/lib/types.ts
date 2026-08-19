import type {
  SommelierResponse,
  SommelierStatus as SharedSommelierStatus,
  WineStructure,
} from '@cave/shared'

/** Formes renvoyées par l'API — miroir de `services/serialize.ts` côté serveur. */

export interface FoodTagView {
  slug: string
  labelFr: string
  emoji: string
}

export interface WineView {
  id: string
  name: string
  producer: string | null
  vintage: number | null
  color: string | null
  country: string | null
  region: string | null
  appellation: string | null
  grapes: string[]
  abv: number | null
  description: string | null
  producerUrl: string | null
  imageUrl: string | null
  vivinoUrl: string | null
  vivinoRating: number | null
  vivinoRatingCount: number | null
  priceAvg: number | null
  structure: WineStructure
  flavors: string[]
  source: string
  foodTags: FoodTagView[]
}

export interface BottleView {
  id: string
  status: 'IN_CELLAR' | 'DRUNK'
  addedAt: string
  drunkAt: string | null
  personalNote: string | null
  personalRating: number | null
  purchasePrice: number | null
  labelPhotoPath: string | null
  ownerLabel: string | null
  slotNumber: number | null
  rackId: string | null
  rackName: string | null
  wine: WineView
}

export interface BottleDetailView {
  bottle: BottleView
  /** Tous les exemplaires encore présents qui partagent exactement le même `wine.id`. */
  activeBottles: BottleView[]
  drinkingWindow: { from: number; to: number } | null
}

export interface FreedSlotView {
  bottleId: string
  slotNumber: number
  rackId: string
  rackName: string
}

export interface DrinkBottlesResult {
  bottles: BottleView[]
  freedSlots: FreedSlotView[]
}

export interface SlotView {
  id: string
  number: number
  row: number
  col: number
  bottles: BottleView[]
  /** Compatibilité transitoire avec une réponse serveur antérieure. */
  bottle?: BottleView | null
}

export interface RackView {
  id: string
  name: string
  rows: number
  cols: number
  numbering: 'ROW_MAJOR' | 'COL_MAJOR'
  startNumber: number
  slots: SlotView[]
}

export interface SearchResult {
  bottles: BottleView[]
  matchedSlots: { rackId: string; slotNumber: number }[]
  total: number
  interpretedFoodTags: string[]
}

export interface CandidateView {
  provider: string
  ref: string
  label: string
  producer: string | null
  vintage: number | null
  imageUrl: string | null
  score: number
}

export interface ProviderStatus {
  vivino: { enabled: boolean; open: boolean; retryAt: string | null }
  gemini?: { configured: boolean; model: string }
}

export interface ResolveResult {
  wine: WineView | null
  candidates: CandidateView[]
  warning: string | null
  providerStatus: ProviderStatus
}

export type SommelierStatus = SharedSommelierStatus
export type SommelierResult = SommelierResponse

export interface DrinkSoonEntry {
  bottle: BottleView
  window: { from: number; to: number }
  status: 'PAST' | 'READY' | 'WAIT'
}
