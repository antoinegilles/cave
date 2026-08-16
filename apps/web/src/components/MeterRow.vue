<script setup lang="ts">
/**
 * Ligne « libellé — barre — valeur », empilée.
 *
 * Le motif d'origine mettait les trois sur une seule ligne avec un libellé à largeur fixe
 * (`w-40`, soit 170 px au pied de page de 17 px). À 320 px il ne restait que 14 px de
 * barre : le graphique des régions ne montrait plus rien.
 *
 * Ici le libellé et la valeur se partagent la première ligne, la barre prend toute la
 * largeur en dessous. Plus rien ne se dispute l'horizontale, donc aucun point de rupture
 * n'est nécessaire : correct à 320 px comme à 1280 px.
 */
withDefaults(
  defineProps<{
    label: string
    /** Valeur déjà formatée : « 12 · 40 % », « 3,5 ». */
    value: string
    percent: number
    /** Couleur de la barre — un jeton de thème, ou une couleur de vin. */
    color?: string
  }>(),
  { color: 'var(--brass)' },
)
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-baseline justify-between gap-3">
      <span class="min-w-0 truncate text-sm text-muted">{{ label }}</span>
      <span class="shrink-0 text-sm tabular-nums text-muted">{{ value }}</span>
    </div>
    <div class="h-2.5 overflow-hidden rounded-full bg-surface-2">
      <div
        class="h-full rounded-full transition-[width]"
        :style="{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }"
      />
    </div>
  </div>
</template>
