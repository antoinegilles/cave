/**
 * Géométrie du plan de casier.
 *
 * Sortie du composant pour être testable : c'est cette arithmétique qui décidait, sans que
 * rien ne le signale, qu'une alvéole ferait 27 px et son numéro 6 px sur un téléphone.
 *
 * Le principe : le SVG garde son `viewBox` en unités fixes, mais on lui impose une largeur
 * **plancher en pixels**. Tant que la largeur disponible suffit, il s'ajuste (comportement
 * bureau inchangé) ; en dessous, le plancher gagne et le conteneur défile horizontalement.
 */

/** Côté d'une alvéole, en unités SVG. */
export const CELL = 100
/** Espace entre deux alvéoles, en unités SVG. */
export const GAP = 10
/** Marge intérieure du meuble, en unités SVG. */
export const PADDING = 44

/**
 * Taille de rendu minimale d'une alvéole, en pixels CSS.
 *
 * 44 px est le minimum d'accessibilité tactile (et la règle que `main.css` applique déjà
 * aux boutons HTML, sans pouvoir l'appliquer à un `<g>` SVG). 52 px laisse en plus la place
 * au numéro : à cette échelle il est rendu à 13 px, lisible.
 */
export const MIN_CELL_PX = 52

export interface RackLayout {
  unitsWidth: number
  unitsHeight: number
  /** Largeur plancher en pixels CSS, pour `width: max(100%, Npx)`. */
  minWidthPx: number
  /** Taille du numéro en unités SVG, réduite si les numéros sont longs. */
  numberFontUnits: number
  /** Vrai si tous les numéros tiennent sur deux chiffres — voir `formatSlotLabel`. */
  padTo2: boolean
}

/** Taille de police tenant dans une alvéole pour un nombre de chiffres donné. */
function fontUnitsFor(digits: number): number {
  // Un chiffre gras occupe environ 0,62 × la taille de police ; on garde 76 unités de
  // large utiles dans l'alvéole (100 moins les marges visuelles).
  if (digits <= 4) return 25
  return Math.max(12, Math.floor(76 / (0.62 * digits)))
}

export function rackLayout(rows: number, cols: number, numbers: number[] = []): RackLayout {
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0
  const digits = String(Math.max(maxNumber, 0)).length
  const unitsWidth = cols * (CELL + GAP) - GAP + PADDING * 2

  return {
    unitsWidth,
    unitsHeight: rows * (CELL + GAP) - GAP + PADDING * 2,
    // L'échelle rendue vaut `largeurPx / unitsWidth`, et l'alvéole `CELL × échelle`. Pour
    // qu'elle atteigne le plancher il faut donc convertir la largeur **entière** du
    // viewBox, marges du meuble comprises — pas seulement la bande des alvéoles.
    minWidthPx: Math.ceil((unitsWidth * MIN_CELL_PX) / CELL),
    numberFontUnits: fontUnitsFor(digits),
    padTo2: numbers.every((n) => n < 100),
  }
}

export function slotX(col: number): number {
  return PADDING + col * (CELL + GAP)
}

/** Rangée 0 en bas : on inverse l'axe Y à l'affichage, comme devant la cave. */
export function slotY(row: number, rows: number): number {
  return PADDING + (rows - 1 - row) * (CELL + GAP)
}

/**
 * Position verticale du repère de rangée, en pourcentage de la hauteur rendue.
 *
 * Exprimée en % pour se résoudre contre la hauteur réelle du SVG sans la mesurer : la
 * gouttière est un frère étiré par le flex, elle a donc exactement la même hauteur.
 */
export function rowTopPercent(index: number, rows: number): string {
  const unitsHeight = rows * (CELL + GAP) - GAP + PADDING * 2
  const centerY = slotY(index, rows) + CELL / 2
  return `${(centerY / unitsHeight) * 100}%`
}

/**
 * Complément à deux chiffres, seulement si tout le casier tient sur deux chiffres.
 *
 * Un casier étiqueté 1, 2, 3, 100, 5, 6 existe : afficher « 05 » à côté de « 100 »
 * inventerait une numérotation absente du meuble.
 */
export function formatSlotLabel(n: number, padTo2: boolean): string {
  return padTo2 && n < 10 ? `0${n}` : String(n)
}

/** `scrollLeft` centrant une colonne dans le défileur, borné aux extrémités. */
export function scrollLeftFor(
  col: number,
  scale: number,
  viewportPx: number,
  maxScroll: number,
): number {
  const centerPx = (slotX(col) + CELL / 2) * scale
  return Math.max(0, Math.min(maxScroll, centerPx - viewportPx / 2))
}

/**
 * Colonnes à rendre pour un état de défilement donné.
 *
 * Sans ce filtrage, un casier de plusieurs milliers d'emplacements produirait autant de
 * groupes SVG : c'est lui qui rend le nombre d'alvéoles indifférent au coût de rendu. La
 * marge d'un écran de part et d'autre évite tout blanc pendant un défilement rapide.
 */
export function visibleColumns(
  scrollLeft: number,
  viewportPx: number,
  scale: number,
  cols: number,
): { first: number; last: number } {
  if (scale <= 0 || viewportPx <= 0) return { first: 0, last: cols - 1 }

  const step = (CELL + GAP) * scale
  const margin = viewportPx
  const first = Math.floor((scrollLeft - margin - PADDING * scale) / step)
  const last = Math.ceil((scrollLeft + viewportPx + margin - PADDING * scale) / step)

  return {
    first: Math.max(0, first),
    last: Math.min(cols - 1, Math.max(0, last)),
  }
}
