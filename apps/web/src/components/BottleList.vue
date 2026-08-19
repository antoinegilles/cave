<script setup lang="ts">
import { WINE_COLOR_LABELS, type WineColor } from '@cave/shared'
import { PhotoIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import {
  bottleGroupLocationLabel,
  compareBottleLocations,
  groupBottles,
} from '../lib/bottleGroups'
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
  /** Ordre visuel des casiers, utilisé avant le numéro d'emplacement. */
  rackOrder: string[]
  /** Emplacements retenus par la recherche, mis en avant dans la liste. */
  highlightedIds?: Set<string>
  emptyMessage?: string
  /** Query ajoutée au lien de chaque ligne — sert par ex. à rouvrir le rangement direct. */
  rowQuery?: Record<string, string>
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
const orderedGroups = computed(() => {
  return groupBottles(props.bottles, props.rackOrder, props.highlightedIds).sort((a, b) => {
    if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1
    if (prefs.listSort === 'slot') {
      const leftMissing = a.representative.slotNumber === null
      const rightMissing = b.representative.slotNumber === null
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
      const compared = compareBottleLocations(a.representative, b.representative, props.rackOrder)
      return prefs.listSortDirection === 'asc' ? compared : -compared
    }
    return compareBottles(
      a.representative,
      b.representative,
      prefs.listSort,
      prefs.listSortDirection,
    )
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
      v-if="orderedGroups.length === 0"
      class="rounded-2xl border border-line bg-surface p-10 text-center text-muted"
    >
      {{ emptyMessage ?? 'Aucune bouteille.' }}
    </p>

    <ul v-if="orderedGroups.length > 0" class="space-y-3">
      <li v-for="group in orderedGroups" :key="group.wineId">
        <RouterLink
          :to="{ name: 'bottle', params: { id: group.representative.id }, query: rowQuery }"
          class="flex items-center gap-3 rounded-2xl border bg-surface p-3 shadow-card transition-colors hover:bg-surface-hover sm:gap-4 sm:p-4"
          :class="group.highlighted ? 'border-accent ring-2 ring-accent/30' : 'border-line'"
        >
          <!-- Visuel de la bouteille, ou pastille de couleur à défaut -->
          <div
            class="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 sm:h-20 sm:w-16"
          >
            <img
              v-if="group.representative.wine.imageUrl"
              :src="group.representative.wine.imageUrl"
              alt=""
              loading="lazy"
              class="h-full w-full object-contain"
            />
            <PhotoIcon v-else class="h-7 w-7 text-faint" aria-hidden="true" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span
                v-if="group.representative.wine.color"
                class="h-3 w-3 shrink-0 rounded-full"
                :class="WINE_DOT[group.representative.wine.color] ?? 'bg-faint'"
                :title="WINE_COLOR_LABELS[group.representative.wine.color as WineColor]"
              />
              <!-- Deux lignes plutôt qu'une troncature : « Château Haut-Bri… » n'aide
                   personne à reconnaître sa bouteille. -->
              <p class="line-clamp-2 font-semibold text-text">
                {{ group.representative.wine.name }}
              </p>
            </div>

            <p class="truncate text-sm text-muted">{{ subtitle(group.representative) }}</p>

            <!-- Propriétaire : nom seul, en italique discret, sans libellé qui alourdirait. -->
            <p
              v-if="group.representative.ownerLabel"
              class="truncate text-xs italic text-faint"
            >
              {{ group.representative.ownerLabel }}
            </p>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                v-if="group.representative.wine.vivinoRating"
                class="text-sm font-semibold text-brass"
                :title="`${group.representative.wine.vivinoRatingCount?.toLocaleString('fr-FR')} avis Vivino`"
              >
                ★ {{ group.representative.wine.vivinoRating.toFixed(1) }}
              </span>

              <!-- Accords en icônes : lisible d'un coup d'œil, sans lire une ligne de texte -->
              <span
                v-if="group.representative.wine.foodTags.length"
                class="flex flex-wrap gap-1 text-base"
                :title="group.representative.wine.foodTags.map((f) => f.labelFr).join(', ')"
              >
                <span
                  v-for="food in group.representative.wine.foodTags.slice(0, 5)"
                  :key="food.slug"
                >
                  {{ food.emoji }}
                </span>
              </span>
            </div>
          </div>

          <!-- Le numéro d'emplacement : le lien avec la cave physique. Il reste à droite,
               c'est l'ancre que l'œil descend chercher le long de la liste. -->
          <div
            class="flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl border px-1.5 text-center sm:h-14 sm:min-w-14"
            :class="group.highlighted ? 'border-accent bg-accent text-accent-text' : 'border-line bg-surface-2 text-brass'"
            :aria-label="bottleGroupLocationLabel(group)"
            role="img"
          >
            <span aria-hidden="true" class="hidden text-[0.65rem] uppercase leading-none opacity-70 sm:block">
              n°
            </span>
            <span aria-hidden="true" class="flex items-baseline gap-1 font-bold leading-tight tabular-nums">
              <span class="text-xl">{{ group.representative.slotNumber ?? '–' }}</span>
              <span v-if="group.count > 1" class="rounded-full bg-brass-soft px-1.5 py-0.5 text-xs text-brass">
                +{{ group.count - 1 }}
              </span>
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
