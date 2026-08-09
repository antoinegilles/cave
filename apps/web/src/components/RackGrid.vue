<script setup lang="ts">
import { WINE_COLOR_HEX, type WineColor } from '@cave/shared'
import { computed, ref } from 'vue'
import type { RackView, SlotView } from '../lib/types'

/**
 * Plan interactif d'un casier.
 *
 * Traduction fidèle du casier physique : la rangée A est celle du bas, comme quand on se
 * tient devant sa cave. Chaque alvéole porte son numéro réel, et la recherche allume les
 * emplacements correspondants — c'est là que cette vue prend tout son sens, debout devant
 * la cave, pour savoir où tendre la main.
 *
 * Les couleurs passent par les variables de thème (`var(--line)`…) : le SVG suit donc la
 * bascule clair/sombre sans code supplémentaire.
 */

const props = defineProps<{
  rack: RackView
  highlightedNumbers: Set<number>
  searchActive: boolean
}>()

const emit = defineEmits<{
  selectBottle: [slot: SlotView]
  selectEmpty: [slot: SlotView]
}>()

/** Géométrie en unités SVG — le viewBox assure le responsive. */
const CELL = 100
const GAP = 10
const PADDING = 44

const width = computed(() => props.rack.cols * (CELL + GAP) - GAP + PADDING * 2)
const height = computed(() => props.rack.rows * (CELL + GAP) - GAP + PADDING * 2)

/** Rangée 0 en bas : on inverse l'axe Y à l'affichage. */
function slotX(slot: SlotView): number {
  return PADDING + slot.col * (CELL + GAP)
}
function slotY(slot: SlotView): number {
  return PADDING + (props.rack.rows - 1 - slot.row) * (CELL + GAP)
}

function bottleColor(slot: SlotView): string {
  const color = slot.bottle?.wine.color as WineColor | null | undefined
  return color ? WINE_COLOR_HEX[color] : 'var(--text-faint)'
}

function isHighlighted(slot: SlotView): boolean {
  return props.highlightedNumbers.has(slot.number)
}

/** Estompe les emplacements hors résultat sans les faire disparaître. */
function slotOpacity(slot: SlotView): number {
  if (!props.searchActive) return 1
  return isHighlighted(slot) ? 1 : 0.2
}

function label(slot: SlotView): string {
  return slot.number < 10 ? `0${slot.number}` : String(slot.number)
}

const hovered = ref<SlotView | null>(null)

function onActivate(slot: SlotView): void {
  if (slot.bottle) emit('selectBottle', slot)
  else emit('selectEmpty', slot)
}

/** Repères de rangée (A, B, C…), convention des casiers du commerce. */
const rowLabels = computed(() =>
  Array.from({ length: props.rack.rows }, (_, i) => String.fromCharCode(65 + i)),
)

const tooltip = computed(() => {
  const slot = hovered.value
  if (!slot?.bottle) return null
  const wine = slot.bottle.wine
  return {
    title: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    rating: wine.vivinoRating,
    region: wine.region,
    foods: wine.foodTags.slice(0, 4),
  }
})
</script>

<template>
  <div class="relative w-full overflow-x-auto">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="mx-auto block h-auto w-full max-w-4xl select-none"
      role="group"
      :aria-label="`Casier ${rack.name}, ${rack.rows} rangées sur ${rack.cols} colonnes`"
    >
      <defs>
        <filter id="rack-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Corps du meuble -->
      <rect
        :width="width"
        :height="height"
        rx="16"
        fill="var(--surface-2)"
        stroke="var(--line)"
        stroke-width="2"
      />

      <text
        v-for="(letter, index) in rowLabels"
        :key="letter"
        :x="PADDING - 18"
        :y="PADDING + (rack.rows - 1 - index) * (CELL + GAP) + CELL / 2 + 7"
        text-anchor="middle"
        fill="var(--text-muted)"
        font-size="22"
        font-weight="600"
      >
        {{ letter }}
      </text>

      <g
        v-for="slot in rack.slots"
        :key="slot.id"
        :opacity="slotOpacity(slot)"
        class="cursor-pointer transition-opacity duration-300"
        role="button"
        tabindex="0"
        :aria-label="
          slot.bottle
            ? `Emplacement ${slot.number} : ${slot.bottle.wine.name}`
            : `Emplacement ${slot.number}, libre`
        "
        @click="onActivate(slot)"
        @keydown.enter.prevent="onActivate(slot)"
        @keydown.space.prevent="onActivate(slot)"
        @mouseenter="hovered = slot"
        @mouseleave="hovered = null"
        @focus="hovered = slot"
        @blur="hovered = null"
      >
        <rect
          :x="slotX(slot)"
          :y="slotY(slot)"
          :width="CELL"
          :height="CELL"
          rx="10"
          :fill="slot.bottle ? 'var(--surface)' : 'transparent'"
          :stroke="isHighlighted(slot) ? 'var(--accent)' : 'var(--line)'"
          :stroke-width="isHighlighted(slot) ? 4 : 1.5"
          :stroke-dasharray="slot.bottle ? '0' : '5 4'"
          :filter="isHighlighted(slot) ? 'url(#rack-glow)' : undefined"
          :class="isHighlighted(slot) ? 'slot-highlight' : ''"
        />

        <!-- Bouteille couchée vue de profil : goulot à gauche, culot à droite. -->
        <g v-if="slot.bottle">
          <rect
            :x="slotX(slot) + 14"
            :y="slotY(slot) + 34"
            :width="CELL - 28"
            :height="24"
            rx="11"
            :fill="bottleColor(slot)"
          />
          <rect
            :x="slotX(slot) + 6"
            :y="slotY(slot) + 40"
            width="14"
            height="12"
            rx="3"
            :fill="bottleColor(slot)"
            opacity="0.75"
          />
          <!-- Reflet : donne le volume du verre sans image bitmap. -->
          <rect
            :x="slotX(slot) + 20"
            :y="slotY(slot) + 38"
            :width="CELL - 42"
            height="5"
            rx="2.5"
            fill="#ffffff"
            opacity="0.3"
          />
        </g>

        <text
          :x="slotX(slot) + CELL / 2"
          :y="slotY(slot) + CELL - 12"
          text-anchor="middle"
          font-size="21"
          font-weight="700"
          :fill="
            isHighlighted(slot)
              ? 'var(--accent)'
              : slot.bottle
                ? 'var(--text)'
                : 'var(--text-faint)'
          "
        >
          {{ label(slot) }}
        </text>
      </g>
    </svg>

    <!-- Fiche au survol, hors SVG pour rester lisible -->
    <Transition name="fade">
      <div
        v-if="tooltip"
        class="pointer-events-none absolute bottom-2 left-1/2 z-10 w-[min(23rem,92%)] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-float"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-semibold text-text">{{ tooltip.title }}</p>
            <p v-if="tooltip.producer" class="truncate text-sm text-muted">
              {{ tooltip.producer }}
              <span v-if="tooltip.vintage"> · {{ tooltip.vintage }}</span>
            </p>
          </div>
          <span
            v-if="tooltip.rating"
            class="shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-sm font-bold text-brass"
          >
            ★ {{ tooltip.rating.toFixed(1) }}
          </span>
        </div>
        <p v-if="tooltip.region" class="mt-1 text-sm text-faint">{{ tooltip.region }}</p>
        <div v-if="tooltip.foods.length" class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="food in tooltip.foods"
            :key="food.slug"
            class="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
          >
            {{ food.emoji }} {{ food.labelFr }}
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
