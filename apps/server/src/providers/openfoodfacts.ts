import { type Candidate, type WineColor, type WineData } from '@cave/shared'
import { fetchWithCache } from './http.js'

/**
 * Open Food Facts — base ouverte, gratuite, sans clé.
 *
 * Testé : ~16 600 produits catégorisés « vins », mais la catégorisation est bruitée et il
 * n'y a ni note ni accords mets-vins. On ne l'utilise donc QUE pour le lookup par code-barres
 * EAN (contre-étiquette), où il est fiable et souvent plus précis que l'OCR.
 *
 * Leur politique demande un User-Agent applicatif identifiable.
 */

const BASE = 'https://world.openfoodfacts.org'
const USER_AGENT = 'CaveApp/1.0 (cave à vin familiale auto-hébergée)'

interface OffProduct {
  product_name?: string
  product_name_fr?: string
  brands?: string
  countries?: string
  labels?: string
  categories_tags?: string[]
  image_url?: string
  quantity?: string
}

/** Les catégories OFF portent la couleur du vin, quand elles sont renseignées. */
function colorFromCategories(tags: string[] | undefined): WineColor | null {
  const joined = (tags ?? []).join(' ').toLowerCase()
  if (/red-wines|vins-rouges|rouge/.test(joined)) return 'RED'
  if (/white-wines|vins-blancs|blanc/.test(joined)) return 'WHITE'
  if (/rose-wines|vins-roses|rose/.test(joined)) return 'ROSE'
  if (/sparkling|champagne|cremant|petillant/.test(joined)) return 'SPARKLING'
  return null
}

function vintageFromName(name: string): number | null {
  const match = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(name)
  return match ? Number.parseInt(match[0], 10) : null
}

export function parseOffProduct(product: OffProduct): WineData | null {
  const name = (product.product_name_fr || product.product_name || '').trim()
  if (!name) return null

  return {
    name,
    producer: product.brands?.split(',')[0]?.trim() || null,
    vintage: vintageFromName(name),
    color: colorFromCategories(product.categories_tags),
    country: product.countries?.split(',')[0]?.trim() || null,
    region: null,
    appellation: null,
    grapes: [],
    abv: null,
    description: null,
    producerUrl: null,
    imageUrl: product.image_url ?? null,
    vivinoId: null,
    vivinoUrl: null,
    vivinoRating: null,
    vivinoRatingCount: null,
    priceAvg: null,
    structure: { acidity: null, tannin: null, sweetness: null, intensity: null, fizziness: null },
    flavors: [],
    foodTags: [],
    source: 'OPENFOODFACTS',
  }
}

export const openFoodFactsProvider = {
  name: 'OPENFOODFACTS' as const,
  available: true,

  /** OFF n'est pas un bon moteur de recherche par nom de vin — on ne l'expose pas ici. */
  async search(): Promise<Candidate[]> {
    return []
  },

  /** `ref` est un code-barres EAN. */
  async details(barcode: string): Promise<WineData | null> {
    if (!/^\d{8,14}$/.test(barcode)) return null

    const url = `${BASE}/api/v2/product/${barcode}.json?fields=product_name,product_name_fr,brands,countries,labels,categories_tags,image_url,quantity`

    try {
      const body = await fetchWithCache(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        minIntervalMs: 500,
      })
      const data = JSON.parse(body) as { status?: number; product?: OffProduct }
      if (data.status !== 1 || !data.product) return null
      return parseOffProduct(data.product)
    } catch {
      return null
    }
  },
}
