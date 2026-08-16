<script setup lang="ts">
import { FOOD_TAGS, STRUCTURE_LABELS, WINE_COLORS, WINE_COLOR_LABELS } from '@cave/shared'
import { ChevronDownIcon, ChevronUpIcon, StarIcon } from '@heroicons/vue/20/solid'
import { computed, ref, useId } from 'vue'

/**
 * Facettes de recherche, repliables.
 *
 * Les quatre groupes rendaient 39 pastilles d'un bloc — plus de 700 px sur téléphone, qui
 * repoussaient les résultats hors de l'écran. Chaque groupe se replie derrière son
 * compteur ; seule « Couleur » est ouverte au départ, ce qui ramène le panneau à une
 * hauteur lisible sans rien retirer.
 */

const props = defineProps<{
  colors: string[]
  foods: string[]
  minRating: number | null
  structure: Record<string, [number, number]>
}>()

const emit = defineEmits<{
  'update:colors': [string[]]
  'update:foods': [string[]]
  'update:minRating': [number | null]
  'update:structure': [Record<string, [number, number]>]
}>()

const structureAxes = ['tannin', 'acidity', 'sweetness', 'intensity'] as const
const RATINGS = [3, 3.5, 4, 4.5]

const uid = useId()
const open = ref({ colors: true, foods: false, structure: false, rating: false })

const counts = computed(() => ({
  colors: props.colors.length,
  foods: props.foods.length,
  structure: Object.keys(props.structure).length,
  rating: props.minRating !== null ? 1 : 0,
}))

function toggleIn(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item]
}

function toggleStructure(axis: string): void {
  const next = { ...props.structure }
  // « Plutôt tannique » = moitié haute de l'échelle.
  if (next[axis]) delete next[axis]
  else next[axis] = [3, 5]
  emit('update:structure', next)
}

const pill =
  'min-h-11 rounded-full border px-4 py-2 text-sm transition-colors'
const pillOn = 'border-accent bg-accent-soft font-medium text-accent'
const pillOff = 'border-line text-muted hover:bg-surface-hover'
</script>

<template>
  <div class="divide-y divide-line">
    <!-- Couleur -->
    <fieldset class="py-2 first:pt-0">
      <legend class="sr-only">Couleur</legend>
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        :aria-expanded="open.colors"
        :aria-controls="`${uid}-colors`"
        @click="open.colors = !open.colors"
      >
        <span class="text-sm font-semibold text-muted">
          Couleur<span v-if="counts.colors" class="text-accent"> · {{ counts.colors }}</span>
        </span>
        <ChevronUpIcon v-if="open.colors" class="h-5 w-5 text-muted" aria-hidden="true" />
        <ChevronDownIcon v-else class="h-5 w-5 text-muted" aria-hidden="true" />
      </button>
      <div v-show="open.colors" :id="`${uid}-colors`" class="flex flex-wrap gap-2 pb-2 pt-1">
        <button
          v-for="color in WINE_COLORS"
          :key="color"
          type="button"
          :class="[pill, colors.includes(color) ? pillOn : pillOff]"
          :aria-pressed="colors.includes(color)"
          @click="emit('update:colors', toggleIn(colors, color))"
        >
          {{ WINE_COLOR_LABELS[color] }}
        </button>
      </div>
    </fieldset>

    <!-- Accords mets-vins -->
    <fieldset class="py-2">
      <legend class="sr-only">Accord mets-vins</legend>
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        :aria-expanded="open.foods"
        :aria-controls="`${uid}-foods`"
        @click="open.foods = !open.foods"
      >
        <span class="text-sm font-semibold text-muted">
          Accord mets-vins<span v-if="counts.foods" class="text-accent"> · {{ counts.foods }}</span>
        </span>
        <ChevronUpIcon v-if="open.foods" class="h-5 w-5 text-muted" aria-hidden="true" />
        <ChevronDownIcon v-else class="h-5 w-5 text-muted" aria-hidden="true" />
      </button>
      <div v-show="open.foods" :id="`${uid}-foods`" class="flex flex-wrap gap-2 pb-2 pt-1">
        <button
          v-for="tag in FOOD_TAGS"
          :key="tag.slug"
          type="button"
          :class="[pill, foods.includes(tag.slug) ? pillOn : pillOff]"
          :aria-pressed="foods.includes(tag.slug)"
          @click="emit('update:foods', toggleIn(foods, tag.slug))"
        >
          {{ tag.emoji }} {{ tag.labelFr }}
        </button>
      </div>
    </fieldset>

    <!-- Profil -->
    <fieldset class="py-2">
      <legend class="sr-only">Profil marqué</legend>
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        :aria-expanded="open.structure"
        :aria-controls="`${uid}-structure`"
        @click="open.structure = !open.structure"
      >
        <span class="text-sm font-semibold text-muted">
          Profil marqué<span v-if="counts.structure" class="text-accent">
            · {{ counts.structure }}</span
          >
        </span>
        <ChevronUpIcon v-if="open.structure" class="h-5 w-5 text-muted" aria-hidden="true" />
        <ChevronDownIcon v-else class="h-5 w-5 text-muted" aria-hidden="true" />
      </button>
      <div v-show="open.structure" :id="`${uid}-structure`" class="flex flex-wrap gap-2 pb-2 pt-1">
        <button
          v-for="axis in structureAxes"
          :key="axis"
          type="button"
          :class="[pill, structure[axis] ? pillOn : pillOff]"
          :aria-pressed="Boolean(structure[axis])"
          @click="toggleStructure(axis)"
        >
          {{ STRUCTURE_LABELS[axis] }}
        </button>
      </div>
    </fieldset>

    <!-- Note minimale -->
    <fieldset class="py-2 last:pb-0">
      <legend class="sr-only">Note Vivino minimale</legend>
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        :aria-expanded="open.rating"
        :aria-controls="`${uid}-rating`"
        @click="open.rating = !open.rating"
      >
        <span class="text-sm font-semibold text-muted">
          Note Vivino minimale<span v-if="counts.rating" class="text-accent">
            · {{ minRating }}+</span
          >
        </span>
        <ChevronUpIcon v-if="open.rating" class="h-5 w-5 text-muted" aria-hidden="true" />
        <ChevronDownIcon v-else class="h-5 w-5 text-muted" aria-hidden="true" />
      </button>
      <div v-show="open.rating" :id="`${uid}-rating`" class="flex flex-wrap gap-2 pb-2 pt-1">
        <button
          v-for="value in RATINGS"
          :key="value"
          type="button"
          :class="[pill, minRating === value ? pillOn : pillOff]"
          :aria-pressed="minRating === value"
          @click="emit('update:minRating', minRating === value ? null : value)"
        >
          <StarIcon class="mr-1 inline h-4 w-4" aria-hidden="true" />{{ value }}+
        </button>
      </div>
    </fieldset>
  </div>
</template>
