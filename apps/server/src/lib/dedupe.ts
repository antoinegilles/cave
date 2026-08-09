/**
 * Clé de déduplication d'un vin.
 *
 * Deux saisies du même vin doivent converger vers la même ligne `Wine` même si l'une vient
 * d'un scan Vivino et l'autre d'une saisie manuelle. On normalise agressivement : accents,
 * casse, ponctuation, articles et mots de liaison courants des noms de domaines.
 */
const NOISE_WORDS = new Set([
  'chateau', 'domaine', 'clos', 'le', 'la', 'les', 'du', 'de', 'des', 'd', 'et',
  'cuvee', 'vignoble', 'vignobles', 'cave', 'caves', 'maison', 'the',
])

export function normalizeForDedupe(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w))
    .join(' ')
}

export function buildDedupeKey(
  producer: string | null | undefined,
  name: string,
  vintage: number | null | undefined,
): string {
  const parts = [normalizeForDedupe(producer ?? ''), normalizeForDedupe(name)]
    .filter(Boolean)
    .join(' ')
  return `${parts}|${vintage ?? 'nv'}`
}
