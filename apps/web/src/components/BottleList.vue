<script setup lang="ts">
import { WINE_COLOR_LABELS, type WineColor } from '@cave/shared'
import { PhotoIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import { compareBottles } from '../lib/bottleSort'
import type { BottleView } from '../lib/types'
import { usePrefsStore } from '../stores/prefs'

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
}>()

// Le tri est un réglage, pas un état de navigation : il se réinitialisait à chaque
// retour depuis une fiche.
const prefs = usePrefsStore()

const WINE_DOT: Record<string, string> = {
  RED: 'bg-wine-red',
  WHITE: 'bg-wine-white',
  ROSE: 'bg-wine-rose',
  SPARKLING: 'bg-wine-sparkling',
  FORTIFIED: 'bg-wine-fortified',
  DESSERT: 'bg-wine-dessert',
}

/**
 * Tri courant, avec les résultats de recherche toujours remontés en tête : quand des
 * emplacements sont allumés, ce sont eux qu'on veut lire en premier.
 */
const ordered = computed(() => {
  const highlighted = props.highlightedIds

  return [...props.bottles].sort((a, b) => {
    if (highlighted?.size) {
      const rank = (highlighted.has(a.id) ? 0 : 1) - (highlighted.has(b.id) ? 0 : 1)
      if (rank !== 0) return rank
    }
    return compareBottles(a, b, prefs.listSort, prefs.listSortDirection)
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

    <ul v-if="ordered.length > 0" class="space-y-3">
      <li v-for="bottle in ordered" :key="bottle.id">
        <RouterLink
          :to="{ name: 'bottle', params: { id: bottle.id } }"
          class="flex items-center gap-3 rounded-2xl border bg-surface p-3 shadow-card transition-colors hover:bg-surface-hover sm:gap-4 sm:p-4"
          :class="
            highlightedIds?.has(bottle.id)
              ? 'border-accent ring-2 ring-accent/30'
              : 'border-line'
          "
        >
          <!-- Visuel de la bouteille, ou pastille de couleur à défaut -->
          <div
            class="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 sm:h-20 sm:w-16"
          >
            <img
              v-if="bottle.wine.imageUrl"
              :src="bottle.wine.imageUrl"
              alt=""
              loading="lazy"
              class="h-full w-full object-contain"
            />
            <PhotoIcon v-else class="h-7 w-7 text-faint" aria-hidden="true" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span
                v-if="bottle.wine.color"
                class="h-3 w-3 shrink-0 rounded-full"
                :class="WINE_DOT[bottle.wine.color] ?? 'bg-faint'"
                :title="WINE_COLOR_LABELS[bottle.wine.color as WineColor]"
              />
              <!-- Deux lignes plutôt qu'une troncature : « Château Haut-Bri… » n'aide
                   personne à reconnaître sa bouteille. -->
              <p class="line-clamp-2 font-semibold text-text">{{ bottle.wine.name }}</p>
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

          <!-- Le numéro d'emplacement : le lien avec la cave physique. Il reste à droite,
               c'est l'ancre que l'œil descend chercher le long de la liste. -->
          <div
            class="flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl border px-1.5 text-center sm:h-14 sm:min-w-14"
            :class="
              highlightedIds?.has(bottle.id)
                ? 'border-accent bg-accent text-accent-text'
                : 'border-line bg-surface-2 text-brass'
            "
          >
            <span class="hidden text-[0.65rem] uppercase leading-none opacity-70 sm:block">n°</span>
            <span class="text-xl font-bold leading-tight tabular-nums">
              <span class="sr-only">emplacement n° </span>{{ bottle.slotNumber ?? '–' }}
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
