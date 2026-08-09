import type { Candidate, LabelExtraction, WineData } from '@cave/shared'
import { enrichWineData } from './heuristics.js'
import { openFoodFactsProvider } from './openfoodfacts.js'
import { vivinoBreaker, vivinoProvider } from './vivino.js'

/**
 * Orchestration des sources de données vin.
 *
 * Ordre : Vivino (le plus riche) → Open Food Facts (code-barres) → heuristiques locales.
 * Aucun échec ne doit être bloquant : l'utilisateur peut toujours saisir sa fiche à la main,
 * et les heuristiques garantissent des accords mets-vins même sans réseau.
 */

export interface ResolveResult {
  wine: WineData | null
  candidates: Candidate[]
  /** Renseigné quand la fiche est dégradée, pour l'afficher honnêtement dans l'UI. */
  warning: string | null
  providerStatus: {
    vivino: { enabled: boolean; open: boolean; retryAt: string | null }
  }
}

function providerStatus() {
  return {
    vivino: {
      enabled: vivinoProvider.available,
      open: vivinoBreaker.isOpen,
      retryAt: vivinoBreaker.status.retryAt,
    },
  }
}

/** Construit la requête texte envoyée à Vivino depuis les champs lus sur l'étiquette. */
export function buildSearchQuery(extraction: LabelExtraction): string {
  return [extraction.producer, extraction.cuvee, extraction.appellation]
    .filter((part): part is string => Boolean(part?.trim()))
    // Évite « Château Margaux Château Margaux » quand cuvée et domaine se répètent.
    .filter((part, index, all) => all.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === index)
    .join(' ')
    .trim()
}

/** Fiche minimale construite à partir de la seule lecture d'étiquette. */
export function wineFromExtraction(extraction: LabelExtraction): WineData | null {
  const name = extraction.cuvee || extraction.appellation || extraction.producer
  if (!name) return null

  return enrichWineData({
    name,
    producer: extraction.producer,
    vintage: extraction.vintage,
    color: extraction.color,
    country: extraction.country,
    region: extraction.appellation,
    appellation: extraction.appellation,
    grapes: [],
    abv: null,
    description: null,
    producerUrl: null,
    imageUrl: null,
    vivinoId: null,
    vivinoUrl: null,
    vivinoRating: null,
    vivinoRatingCount: null,
    priceAvg: null,
    structure: { acidity: null, tannin: null, sweetness: null, intensity: null, fizziness: null },
    flavors: [],
    foodTags: [],
    source: 'MANUAL',
  })
}

/** Recherche texte : uniquement Vivino sait le faire correctement pour du vin. */
export async function searchWines(query: string): Promise<Candidate[]> {
  if (!query.trim()) return []
  try {
    return await vivinoProvider.search(query)
  } catch {
    return []
  }
}

/** Récupère la fiche complète d'un candidat Vivino. */
export async function resolveVivino(wineId: string): Promise<WineData | null> {
  try {
    const wine = await vivinoProvider.details(wineId)
    return wine ? enrichWineData(wine) : null
  } catch {
    return null
  }
}

/** Résolution par code-barres EAN (contre-étiquette). */
export async function resolveBarcode(barcode: string): Promise<ResolveResult> {
  const offWine = await openFoodFactsProvider.details(barcode)

  if (!offWine) {
    return {
      wine: null,
      candidates: [],
      warning: 'Code-barres inconnu d’Open Food Facts. Essaie la photo de l’étiquette.',
      providerStatus: providerStatus(),
    }
  }

  // OFF donne un nom fiable mais ni note ni accords : on relance une recherche Vivino
  // à partir de ce nom pour récupérer la fiche riche.
  const query = [offWine.producer, offWine.name].filter(Boolean).join(' ')
  const candidates = await searchWines(query)

  if (candidates[0]) {
    const enriched = await resolveVivino(candidates[0].ref)
    if (enriched) {
      return { wine: enriched, candidates, warning: null, providerStatus: providerStatus() }
    }
  }

  return {
    wine: enrichWineData(offWine),
    candidates,
    warning: vivinoBreaker.isOpen
      ? 'Vivino est momentanément indisponible : accords estimés depuis le cépage et la région.'
      : 'Aucune fiche Vivino trouvée : accords estimés depuis le cépage et la région.',
    providerStatus: providerStatus(),
  }
}

/** Résolution depuis une lecture d'étiquette. */
export async function resolveFromLabel(extraction: LabelExtraction): Promise<ResolveResult> {
  const query = buildSearchQuery(extraction)
  const candidates = query ? await searchWines(query) : []

  // On privilégie un candidat du bon millésime quand l'étiquette l'indique.
  const best =
    candidates.find((c) => extraction.vintage != null && c.vintage === extraction.vintage) ??
    candidates[0]

  if (best) {
    const wine = await resolveVivino(best.ref)
    if (wine) {
      return {
        // Le millésime lu sur l'étiquette fait foi : la fiche Vivino peut porter un autre
        // millésime alors que la bouteille physique en main est celle qu'on range.
        wine: { ...wine, vintage: extraction.vintage ?? wine.vintage },
        candidates,
        warning: null,
        providerStatus: providerStatus(),
      }
    }
  }

  const fallback = wineFromExtraction(extraction)
  return {
    wine: fallback,
    candidates,
    warning: fallback
      ? vivinoBreaker.isOpen
        ? 'Vivino est momentanément indisponible : fiche établie depuis l’étiquette, accords estimés.'
        : 'Aucune correspondance Vivino : vérifie les informations et complète si besoin.'
      : 'Étiquette illisible. Saisis les informations à la main.',
    providerStatus: providerStatus(),
  }
}

export { providerStatus }
