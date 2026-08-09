<script setup lang="ts">
import { WINE_COLOR_LABELS, type WineColor } from '@cave/shared'
import { computed, ref } from 'vue'
import type { BottleView } from '../lib/types'

/**
 * Vue liste de la cave — l'affichage par défaut.
 *
 * Le plan du casier ne sert vraiment que debout devant la cave ; pour parcourir sa
 * collection depuis un canapé, une liste lisible avec visuel, note et accords est bien
 * plus utile. Le numéro d'emplacement reste affiché en grand : c'est lui qui fait le
 * lien avec la bouteille physique.
 */

const props = defineProps<{
  bottles: BottleView[]
  /** Emplacements retenus par la recherche, mis en avant dans la liste. */
  highlightedIds?: Set<string>
  emptyMessage?: string
  /** Masque le sélecteur de tri (historique, où l'ordre chronologique fait foi). */
  hideSort?: boolean
}>()

type SortKey = 'slot' | 'name' | 'rating' | 'vintage'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'slot', label: 'Emplacement' },
  { key: 'name', label: 'Nom' },
  { key: 'rating', label: 'Note' },
  { key: 'vintage', label: 'Millésime' },
]

const sortKey = ref<SortKey>('slot')

const WINE_DOT: Record<string, string> = {
  RED: 'bg-wine-red',
  WHITE: 'bg-wine-white',
  ROSE: 'bg-wine-rose',
  SPARKLING: 'bg-wine-sparkling',
  FORTIFIED: 'bg-wine-fortified',
  DESSERT: 'bg-wine-dessert',
}

/** Comparateurs par critère. Les valeurs absentes sont rejetées en fin de liste. */
const COMPARATORS: Record<SortKey, (a: BottleView, b: BottleView) => number> = {
  slot: (a, b) => (a.slotNumber ?? Infinity) - (b.slotNumber ?? Infinity),
  name: (a, b) => a.wine.name.localeCompare(b.wine.name, 'fr'),
  rating: (a, b) => (b.wine.vivinoRating ?? -1) - (a.wine.vivinoRating ?? -1),
  vintage: (a, b) => (b.wine.vintage ?? -1) - (a.wine.vintage ?? -1),
}

/**
 * Tri courant, avec les résultats de recherche toujours remontés en tête : quand des
 * emplacements sont allumés, ce sont eux qu'on veut lire en premier.
 */
const ordered = computed(() => {
  const compare = COMPARATORS[sortKey.value]
  const highlighted = props.highlightedIds

  return [...props.bottles].sort((a, b) => {
    if (highlighted?.size) {
      const rank = (highlighted.has(a.id) ? 0 : 1) - (highlighted.has(b.id) ? 0 : 1)
      if (rank !== 0) return rank
    }
    return compare(a, b)
  })
})

function subtitle(bottle: BottleView): string {
  return [bottle.wine.producer, bottle.wine.region, bottle.wine.vintage]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <div>
    <p
      v-if="ordered.length === 0"
      class="rounded-2xl border border-line bg-surface p-10 text-center text-muted"
    >
      {{ emptyMessage ?? 'Aucune bouteille.' }}
    </p>

    <div v-else-if="!hideSort" class="mb-3 flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">Trier par</span>
      <div class="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        <button
          v-for="option in SORTS"
          :key="option.key"
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            sortKey === option.key
              ? 'bg-accent text-accent-text'
              : 'text-muted hover:bg-surface-hover hover:text-text'
          "
          :aria-pressed="sortKey === option.key"
          @click="sortKey = option.key"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <ul v-if="ordered.length > 0" class="space-y-3">
      <li v-for="bottle in ordered" :key="bottle.id">
        <RouterLink
          :to="{ name: 'bottle', params: { id: bottle.id } }"
          class="flex items-center gap-4 rounded-2xl border bg-surface p-3 shadow-card transition-colors hover:bg-surface-hover sm:p-4"
          :class="
            highlightedIds?.has(bottle.id)
              ? 'border-accent ring-2 ring-accent/30'
              : 'border-line'
          "
        >
          <!-- Visuel de la bouteille, ou pastille de couleur à défaut -->
          <div
            class="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2"
          >
            <img
              v-if="bottle.wine.imageUrl"
              :src="bottle.wine.imageUrl"
              alt=""
              loading="lazy"
              class="h-full w-full object-contain"
            />
            <span v-else class="text-3xl" aria-hidden="true">🍷</span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span
                v-if="bottle.wine.color"
                class="h-3 w-3 shrink-0 rounded-full"
                :class="WINE_DOT[bottle.wine.color] ?? 'bg-faint'"
                :title="WINE_COLOR_LABELS[bottle.wine.color as WineColor]"
              />
              <p class="truncate font-semibold text-text">{{ bottle.wine.name }}</p>
            </div>

            <p class="truncate text-sm text-muted">{{ subtitle(bottle) }}</p>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                v-if="bottle.wine.vivinoRating"
                class="text-sm font-semibold text-brass"
                :title="`${bottle.wine.vivinoRatingCount?.toLocaleString('fr-FR')} avis Vivino`"
              >
                ★ {{ bottle.wine.vivinoRating.toFixed(1) }}
              </span>

              <!-- Accords en icônes : lisible d'un coup d'œil, sans lire une ligne de texte -->
              <span
                v-if="bottle.wine.foodTags.length"
                class="flex flex-wrap gap-1 text-base"
                :title="bottle.wine.foodTags.map((f) => f.labelFr).join(', ')"
              >
                <span v-for="food in bottle.wine.foodTags.slice(0, 5)" :key="food.slug">
                  {{ food.emoji }}
                </span>
              </span>
            </div>
          </div>

          <!-- Le numéro d'emplacement : le lien avec la cave physique -->
          <div
            class="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-center"
            :class="
              highlightedIds?.has(bottle.id)
                ? 'border-accent bg-accent text-accent-text'
                : 'border-line bg-surface-2 text-brass'
            "
          >
            <span class="text-[0.65rem] uppercase leading-none opacity-70">n°</span>
            <span class="text-xl font-bold leading-tight tabular-nums">
              {{ bottle.slotNumber ?? '–' }}
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
