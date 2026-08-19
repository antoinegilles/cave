<script setup lang="ts">
import { WINE_COLOR_HEX, WINE_COLOR_LABELS, type WineColor } from '@cave/shared'
import { computed } from 'vue'

/**
 * Silhouette de bouteille debout, remplie de la couleur du vin.
 *
 * Sert de repli quand une fiche n'a pas de photo d'étiquette : un import en masse en laisse
 * beaucoup (Vivino injoignable côté serveur). Plutôt qu'une icône « photo » grise et muette,
 * on montre au moins la couleur — le même langage visuel que les bouteilles du plan de casier.
 * Couleur inconnue → teinte neutre.
 */

const props = defineProps<{ color?: string | null }>()

const isKnown = (value: string | null | undefined): value is WineColor =>
  value != null && value in WINE_COLOR_HEX

const fill = computed(() => (isKnown(props.color) ? WINE_COLOR_HEX[props.color] : 'var(--text-faint)'))
const label = computed(() =>
  isKnown(props.color) ? `Vin ${WINE_COLOR_LABELS[props.color].toLowerCase()}, sans photo` : 'Bouteille sans photo',
)
</script>

<template>
  <svg viewBox="0 0 24 40" role="img" :aria-label="label" class="h-full w-auto">
    <!-- Goulot puis épaule et corps : un seul tracé pour une silhouette nette. -->
    <path
      d="M10 3 h4 v6 c0 1.6 0.7 2.4 1.6 3.5 C17 17 17.5 19 17.5 22 v11 c0 2.2 -1.3 3.5 -3.5 3.5 h-4 c-2.2 0 -3.5 -1.3 -3.5 -3.5 V22 c0 -3 0.5 -5 1.9 -6.5 C9.3 11.4 10 10.6 10 9 Z"
      :fill="fill"
      opacity="0.9"
    />
    <!-- Reflet vertical : donne le volume du verre sans bitmap. -->
    <rect x="9" y="17" width="2.5" height="15" rx="1.25" fill="#ffffff" opacity="0.28" />
  </svg>
</template>
