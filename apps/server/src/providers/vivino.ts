import { type Candidate, type WineColor, type WineData, matchFoodTag } from '@cave/shared'
import * as cheerio from 'cheerio'
import { config } from '../config.js'
import { CircuitBreaker, HttpError, fetchWithCache } from './http.js'

/**
 * Provider Vivino.
 *
 * Vivino n'expose plus d'API publique. On s'appuie sur deux surfaces vérifiées :
 *  1. la page de recherche `/fr/search/wines?q=` pour la correspondance texte → wine id ;
 *  2. la page vin `/FR/fr/<seo>/w/<id>` qui embarque `window.__PRELOADED_STATE__.winePageInformation`,
 *     un JSON complet (note, accords, cépages, région, profil) ainsi qu'un JSON-LD `Product`.
 *
 * Les classes CSS de Vivino sont hashées par module (`wineCard__wineCard--3r0eR`) et changent
 * à chaque déploiement : on ne cible donc QUE des attributs stables (`data-testid`, `aria-label`).
 *
 * Volumétrie : une requête par bouteille ajoutée, résultat mis en cache définitivement.
 */

const BASE = 'https://www.vivino.com'

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

export const vivinoBreaker = new CircuitBreaker(3, 3_600_000)

/** `type_id` Vivino → couleur interne. Relevé sur les fiches réelles. */
const TYPE_ID_TO_COLOR: Record<number, WineColor> = {
  1: 'RED',
  2: 'WHITE',
  3: 'SPARKLING',
  4: 'ROSE',
  7: 'DESSERT',
  24: 'FORTIFIED',
}

interface VivinoFood {
  name?: string
}
interface VivinoGrape {
  name?: string
}
interface VivinoStyle {
  food?: VivinoFood[]
  grapes?: VivinoGrape[]
  body?: number | null
  acidity?: number | null
  baseline_structure?: Record<string, number | null> | null
}
interface VivinoWine {
  id?: number
  name?: string
  seo_name?: string
  type_id?: number
  alcohol?: number | string | null
  description?: string | null
  winery?: { name?: string } | null
  region?: { name?: string; country?: { name?: string } } | null
  statistics?: { ratings_average?: number; ratings_count?: number } | null
  image?: { location?: string; variations?: Record<string, string> } | null
  grapes?: VivinoGrape[] | null
  foods?: VivinoFood[] | null
  style?: VivinoStyle | null
  taste?: { structure?: Record<string, number | null> | null; flavor?: FlavorGroup[] | null } | null
}
interface FlavorGroup {
  group?: string
  primary_keywords?: { name?: string; count?: number }[]
}
interface WinePageInformation {
  wine?: VivinoWine
  vintage?: { year?: number | string | null; statistics?: { ratings_average?: number; ratings_count?: number } } | null
  price_range?: { price_range?: { minimum?: number; maximum?: number } } | null
}

/** `//images.vivino.com/...` → URL absolue exploitable. */
function absolutize(url: string | undefined | null): string | null {
  if (!url) return null
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http')) return url
  return null
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Extrait `window.__PRELOADED_STATE__.winePageInformation = {...}`.
 *
 * Le JSON est suivi d'autre code JS, donc on ne peut pas prendre « jusqu'au dernier `}` ».
 * On décode de façon incrémentale en suivant l'équilibre des accolades, en tenant compte
 * des chaînes et des échappements.
 */
export function extractPreloadedState(html: string): WinePageInformation | null {
  const marker = /window\.__PRELOADED_STATE__\.winePageInformation\s*=\s*/
  const match = marker.exec(html)
  if (!match) return null

  const start = html.indexOf('{', match.index + match[0].length)
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < html.length; i++) {
    const char = html[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as WinePageInformation
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** JSON-LD `Product` — filet de sécurité si le state préchargé disparaît. */
export function extractJsonLd(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html)
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).text()) as Record<string, unknown>
      if (data['@type'] === 'Product') return data
    } catch {
      // Un bloc JSON-LD malformé ne doit pas invalider les autres.
    }
  }
  return null
}

/** Parse la page de résultats de recherche. Exporté pour être testé sur fixture. */
export function parseSearchPage(html: string): Candidate[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  $('[data-testid="wineCard"]').each((index, card) => {
    const $card = $(card)
    const href = $card.find('a[data-testid="vintagePageLink"]').attr('href')
    if (!href) return

    const idMatch = /\/w\/(\d+)/.exec(href)
    if (!idMatch?.[1]) return
    const wineId = idMatch[1]
    if (seen.has(wineId)) return
    seen.add(wineId)

    // L'aria-label du visuel porte le libellé complet « Château Le Coteau Margaux 2017 ».
    const label = $card.find('[role="img"][aria-label]').attr('aria-label')?.trim()
    if (!label) return

    const bg = $card.find('[role="img"][aria-label]').attr('style') ?? ''
    const imageUrl = absolutize(/url\((?:'|")?([^)'"]+)/.exec(bg)?.[1])

    const yearMatch = /\b(19|20)\d{2}\b/.exec(label)
    const vintage = yearMatch ? Number.parseInt(yearMatch[0], 10) : null

    candidates.push({
      provider: 'VIVINO',
      ref: wineId,
      label,
      producer: null,
      vintage,
      imageUrl,
      // Vivino trie déjà par pertinence : on conserve son ordre plutôt que de rescorer.
      score: Math.max(0, 1 - index * 0.05),
    })
  })

  return candidates
}

/** Parse une page vin complète. Exporté pour être testé sur fixture. */
export function parseWinePage(html: string, wineId: string): WineData | null {
  const state = extractPreloadedState(html)
  const jsonLd = extractJsonLd(html)
  const wine = state?.wine

  if (!wine?.name && !jsonLd?.name) return null

  const style = wine?.style ?? null
  const stats = state?.vintage?.statistics ?? wine?.statistics ?? null

  // Le profil gustatif se trouve selon les pages dans `taste.structure` ou
  // `style.baseline_structure`. À défaut, `style.body`/`style.acidity` (échelle 1-5)
  // donnent déjà deux axes exploitables pour la recherche.
  const rawStructure = wine?.taste?.structure ?? style?.baseline_structure ?? null
  const structure = {
    acidity: toNumber(rawStructure?.['acidity']) ?? toNumber(style?.acidity),
    tannin: toNumber(rawStructure?.['tannin']),
    sweetness: toNumber(rawStructure?.['sweetness']),
    intensity: toNumber(rawStructure?.['intensity']) ?? toNumber(style?.body),
    fizziness: toNumber(rawStructure?.['fizziness']),
  }

  const flavors = (wine?.taste?.flavor ?? [])
    .flatMap((group) => (group.primary_keywords ?? []).map((k) => k.name))
    .filter((name): name is string => Boolean(name))
    .slice(0, 12)

  // `wine.foods` et `style.food` se recoupent partiellement — on fusionne puis on rabat
  // sur nos slugs canoniques, ce qui absorbe au passage les libellés FR comme EN.
  const foodLabels = [...(wine?.foods ?? []), ...(style?.food ?? [])]
    .map((f) => f.name)
    .filter((name): name is string => Boolean(name))

  const foodTags = [...new Set(foodLabels.map(matchFoodTag).filter((s): s is string => Boolean(s)))]

  const grapes = [...new Set([...(wine?.grapes ?? []), ...(style?.grapes ?? [])]
    .map((g) => g.name)
    .filter((name): name is string => Boolean(name)))]

  const ldRating = (jsonLd?.['aggregateRating'] ?? null) as {
    ratingValue?: string | number
    ratingCount?: string | number
  } | null

  const seoName = wine?.seo_name ?? ''
  const priceRange = state?.price_range?.price_range
  const priceAvg =
    priceRange?.minimum != null && priceRange?.maximum != null && priceRange.maximum > 0
      ? (priceRange.minimum + priceRange.maximum) / 2
      : null

  return {
    name: wine?.name ?? String(jsonLd?.['name'] ?? ''),
    producer: wine?.winery?.name ?? null,
    vintage: toNumber(state?.vintage?.year),
    color: wine?.type_id != null ? (TYPE_ID_TO_COLOR[wine.type_id] ?? null) : null,
    country: wine?.region?.country?.name ?? null,
    region: wine?.region?.name ?? null,
    appellation: wine?.region?.name ?? null,
    grapes,
    abv: toNumber(wine?.alcohol),
    description: wine?.description?.trim() || (jsonLd?.['description'] as string | undefined) || null,
    producerUrl: null,
    imageUrl: absolutize(wine?.image?.variations?.['bottle_large'] ?? wine?.image?.location),
    vivinoId: wineId,
    vivinoUrl: seoName ? `${BASE}/FR/fr/${seoName}/w/${wineId}` : `${BASE}/w/${wineId}`,
    vivinoRating: toNumber(stats?.ratings_average) ?? toNumber(ldRating?.ratingValue),
    vivinoRatingCount: toNumber(stats?.ratings_count) ?? toNumber(ldRating?.ratingCount),
    priceAvg,
    structure,
    flavors,
    foodTags,
    source: 'VIVINO',
  }
}

async function get(url: string): Promise<string> {
  try {
    const body = await fetchWithCache(url, {
      headers: BROWSER_HEADERS,
      minIntervalMs: config.VIVINO_MIN_INTERVAL_MS,
    })
    vivinoBreaker.recordSuccess()
    return body
  } catch (error) {
    // Seuls les signaux de blocage ouvrent le circuit ; un 404 sur un vin donné est normal.
    if (error instanceof HttpError && ![404, 410].includes(error.status)) {
      vivinoBreaker.recordFailure()
    } else if (!(error instanceof HttpError)) {
      vivinoBreaker.recordFailure()
    }
    throw error
  }
}

export const vivinoProvider = {
  name: 'VIVINO' as const,

  get available(): boolean {
    return config.VIVINO_ENABLED && !vivinoBreaker.isOpen
  },

  async search(query: string): Promise<Candidate[]> {
    if (!this.available) return []
    const url = `${BASE}/fr/search/wines?q=${encodeURIComponent(query)}`
    return parseSearchPage(await get(url))
  },

  async details(wineId: string): Promise<WineData | null> {
    if (!this.available) return null
    // Le slug SEO est optionnel : Vivino redirige vers l'URL canonique.
    const url = `${BASE}/FR/fr/wine/w/${wineId}`
    return parseWinePage(await get(url), wineId)
  },
}
