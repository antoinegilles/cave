/**
 * Verrou de défilement du corps de page, à compteur.
 *
 * Le compteur n'est pas un excès de prudence : les feuilles s'imbriquent (les filtres
 * ouvrent le choix d'un emplacement). Sans lui, fermer la feuille intérieure rendrait le
 * défilement à la page alors que la feuille extérieure est encore ouverte.
 */
let depth = 0
let previousOverflow = ''

export function lockScroll(): void {
  if (typeof document === 'undefined') return
  if (depth === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.getElementById('app')?.setAttribute('inert', '')
  }
  depth++
}

export function unlockScroll(): void {
  if (typeof document === 'undefined' || depth === 0) return
  depth--
  if (depth === 0) {
    document.body.style.overflow = previousOverflow
    document.getElementById('app')?.removeAttribute('inert')
  }
}
