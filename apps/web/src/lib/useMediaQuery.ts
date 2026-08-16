import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Media query réactive, sans dépendance.
 *
 * Le projet n'embarque volontairement aucune bibliothèque utilitaire ; c'est le seul
 * morceau de VueUse dont l'app a besoin.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false)
  if (typeof window === 'undefined' || !window.matchMedia) return matches

  const media = window.matchMedia(query)
  matches.value = media.matches

  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches
  }
  media.addEventListener('change', onChange)
  onScopeDispose(() => media.removeEventListener('change', onChange))

  return matches
}

/**
 * Vrai quand l'appareil a un vrai survol et un pointeur fin (souris, trackpad).
 *
 * On arbitre sur la **capacité du pointeur**, pas sur la largeur : une fenêtre étroite sur
 * un bureau garde le survol et le clic direct, une tablette large ne les a jamais eus.
 */
export function useHoverPointer(): Ref<boolean> {
  return useMediaQuery('(hover: hover) and (pointer: fine)')
}

export function useReducedMotion(): Ref<boolean> {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
