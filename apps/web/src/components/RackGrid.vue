<script setup lang="ts">
import { WINE_COLOR_HEX, type WineColor } from '@cave/shared'
import { ArrowRightIcon } from '@heroicons/vue/20/solid'
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import {
  CELL,
  formatSlotLabel,
  rackLayout,
  rowLabel,
  rowTopPercent,
  scrollLeftFor,
  slotX,
  slotY,
  visibleColumns,
} from '../lib/rackLayout'
import { useHoverPointer, useReducedMotion } from '../lib/useMediaQuery'
import type { RackView, SlotView } from '../lib/types'

/**
 * Plan interactif d'un casier.
 *
 * Traduction fidèle du casier physique : la rangée A est celle du bas, comme quand on se
 * tient devant sa cave. Chaque alvéole porte son numéro réel, et la recherche allume les
 * emplacements correspondants — c'est là que cette vue prend tout son sens, debout devant
 * la cave, pour savoir où tendre la main.
 *
 * Le plan ne se comprime **plus** pour tenir dans la largeur de l'écran. Il l'a longtemps
 * fait, ce qui donnait sur téléphone des alvéoles de 27 px et des numéros de 6 px : la vue
 * était illisible précisément sur l'appareil pour lequel elle existe. Désormais l'alvéole
 * a une taille plancher (`MIN_CELL_PX`) et le plan défile horizontalement — les repères de
 * rangée restant figés à gauche pour ne jamais perdre le fil.
 *
 * Les couleurs passent par les variables de thème (`var(--line)`…) : le SVG suit donc la
 * bascule clair/sombre sans code supplémentaire.
 */

const props = defineProps<{
  rack: RackView
  highlightedNumbers: Set<number>
  searchActive: boolean
  /** Emplacement à amener au centre du défileur. */
  focusNumber?: number | null
}>()

const emit = defineEmits<{
  selectBottle: [slot: SlotView]
  selectEmpty: [slot: SlotView]
}>()

const hoverPointer = useHoverPointer()
const reducedMotion = useReducedMotion()

/** Un `id` de filtre par instance : deux plans montés ensemble se voleraient la lueur. */
const glowId = `rack-glow-${useId()}`

const layout = computed(() =>
  rackLayout(
    props.rack.rows,
    props.rack.cols,
    props.rack.slots.map((s) => s.number),
  ),
)

const scroller = ref<HTMLElement | null>(null)
const scroll = ref({ left: 0, clientWidth: 0, scrollWidth: 0 })
const hasScrolled = ref(false)

function readScroll(): void {
  const el = scroller.value
  if (!el) return
  scroll.value = {
    left: el.scrollLeft,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }
}

function onScroll(): void {
  if (scroller.value && scroller.value.scrollLeft > 0) hasScrolled.value = true
  readScroll()
}

onMounted(async () => {
  await nextTick()
  readScroll()
  if (props.focusNumber != null) scrollToNumber(props.focusNumber)
  window.addEventListener('resize', readScroll)
})
onUnmounted(() => window.removeEventListener('resize', readScroll))

/** Échelle réellement appliquée au viewBox, déduite de la largeur rendue du SVG. */
const scale = computed(() =>
  scroll.value.scrollWidth > 0 ? scroll.value.scrollWidth / layout.value.unitsWidth : 0,
)

const scrollable = computed(() => scroll.value.scrollWidth > scroll.value.clientWidth + 1)
const canScrollLeft = computed(() => scroll.value.left > 1)
const canScrollRight = computed(
  () => scroll.value.left + scroll.value.clientWidth < scroll.value.scrollWidth - 1,
)

/** Barre de position sous le plan : indique où l'on se trouve dans le casier. */
const mapWidth = computed(
  () => `${Math.max(8, (scroll.value.clientWidth / scroll.value.scrollWidth) * 100)}%`,
)
const mapOffset = computed(() => `${(scroll.value.left / scroll.value.scrollWidth) * 100}%`)

/**
 * Alvéoles réellement rendues.
 *
 * Sans ce filtrage, un casier de plusieurs milliers d'emplacements produirait autant de
 * groupes SVG. C'est lui qui rend le nombre d'alvéoles indifférent au coût de rendu.
 */
const visibleSlots = computed(() => {
  const { first, last } = visibleColumns(
    scroll.value.left,
    scroll.value.clientWidth,
    scale.value,
    props.rack.cols,
  )
  return props.rack.slots.filter((slot) => slot.col >= first && slot.col <= last)
})

function bottleColor(slot: SlotView): string {
  const color = slot.bottles[0]?.wine.color as WineColor | null | undefined
  return color ? WINE_COLOR_HEX[color] : 'var(--text-faint)'
}

function isHighlighted(slot: SlotView): boolean {
  return props.highlightedNumbers.has(slot.number)
}

/**
 * Emplacement écarté par la recherche.
 *
 * Ces alvéoles restaient cliquables et focusables sous 20 % d'opacité : on perdait sa
 * recherche en touchant à côté, et le clavier traversait soixante arrêts invisibles.
 */
function isInert(slot: SlotView): boolean {
  return props.searchActive && !isHighlighted(slot)
}

/** Estompe les emplacements hors résultat sans les faire disparaître. */
function slotOpacity(slot: SlotView): number {
  if (!props.searchActive) return 1
  return isHighlighted(slot) ? 1 : 0.2
}

function label(slot: SlotView): string {
  return formatSlotLabel(slot.number, layout.value.padTo2)
}

const hovered = ref<SlotView | null>(null)

function onActivate(slot: SlotView): void {
  if (isInert(slot)) return
  if (slot.bottles.length > 0) emit('selectBottle', slot)
  else emit('selectEmpty', slot)
}

/** Repères de rangée (A, B, C…), convention des casiers du commerce. */
const rowLabels = computed(() =>
  Array.from({ length: props.rack.rows }, (_, index) => rowLabel(index)),
)

/** Amène une alvéole au centre du défileur. */
function scrollToNumber(number: number): void {
  const el = scroller.value
  const slot = props.rack.slots.find((s) => s.number === number)
  if (!el || !slot) return

  readScroll()
  if (scale.value <= 0) return

  el.scrollTo({
    left: scrollLeftFor(
      slot.col,
      scale.value,
      el.clientWidth,
      Math.max(0, el.scrollWidth - el.clientWidth),
    ),
    behavior: reducedMotion.value ? 'auto' : 'smooth',
  })
}

watch(
  () => props.focusNumber,
  (number) => {
    if (number != null) scrollToNumber(number)
  },
  { flush: 'post' },
)

const tooltip = computed(() => {
  const slot = hovered.value
  const bottle = slot?.bottles[0]
  if (!bottle) return null
  const wine = bottle.wine
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
  <div class="relative">
    <div class="flex items-stretch">
      <!-- Gouttière figée : le plan défile, les rangées restent identifiables. -->
      <div class="relative w-7 shrink-0" aria-hidden="true">
        <span
          v-for="(letter, index) in rowLabels"
          :key="letter"
          class="absolute right-1 -translate-y-1/2 text-sm font-semibold text-muted"
          :style="{ top: rowTopPercent(index, rack.rows) }"
        >
          {{ letter }}
        </span>
      </div>

      <div
        ref="scroller"
        class="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
        @scroll.passive="onScroll"
      >
        <svg
          :viewBox="`0 0 ${layout.unitsWidth} ${layout.unitsHeight}`"
          :style="{ width: `max(100%, ${layout.minWidthPx}px)` }"
          class="block h-auto select-none"
          role="group"
          :aria-label="`Casier ${rack.name}, ${rack.rows} rangées sur ${rack.cols} colonnes`"
        >
          <defs>
            <filter :id="glowId" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- Corps du meuble -->
          <rect
            :width="layout.unitsWidth"
            :height="layout.unitsHeight"
            rx="16"
            fill="var(--surface-2)"
            stroke="var(--line)"
            stroke-width="2"
          />

          <g
            v-for="slot in visibleSlots"
            :key="slot.id"
            :opacity="slotOpacity(slot)"
            class="transition-opacity duration-300"
            :class="isInert(slot) ? 'pointer-events-none' : 'cursor-pointer'"
            :role="isInert(slot) ? undefined : 'button'"
            :tabindex="isInert(slot) ? undefined : 0"
            :aria-hidden="isInert(slot) || undefined"
            :aria-label="
              slot.bottles.length > 0
                ? `Emplacement ${slot.number} : ${slot.bottles.length} bouteille${slot.bottles.length > 1 ? 's' : ''}`
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
              :x="slotX(slot.col)"
              :y="slotY(slot.row, rack.rows)"
              :width="CELL"
              :height="CELL"
              rx="10"
              :fill="slot.bottles.length > 0 ? 'var(--surface)' : 'transparent'"
              :stroke="isHighlighted(slot) ? 'var(--accent)' : 'var(--line)'"
              :stroke-width="isHighlighted(slot) ? 4 : 1.5"
              :stroke-dasharray="slot.bottles.length > 0 ? '0' : '5 4'"
              :filter="isHighlighted(slot) ? `url(#${glowId})` : undefined"
              :class="isHighlighted(slot) ? 'slot-highlight' : ''"
            />

            <!-- Bouteille couchée vue de profil : goulot à gauche, culot à droite. -->
            <g v-if="slot.bottles.length > 0">
              <rect
                :x="slotX(slot.col) + 14"
                :y="slotY(slot.row, rack.rows) + 34"
                :width="CELL - 28"
                :height="24"
                rx="11"
                :fill="bottleColor(slot)"
              />
              <rect
                :x="slotX(slot.col) + 6"
                :y="slotY(slot.row, rack.rows) + 40"
                width="14"
                height="12"
                rx="3"
                :fill="bottleColor(slot)"
                opacity="0.75"
              />
              <!-- Reflet : donne le volume du verre sans image bitmap. -->
              <rect
                :x="slotX(slot.col) + 20"
                :y="slotY(slot.row, rack.rows) + 38"
                :width="CELL - 42"
                height="5"
                rx="2.5"
                fill="#ffffff"
                opacity="0.3"
              />
            </g>

            <g v-if="slot.bottles.length > 1" aria-hidden="true">
              <circle
                :cx="slotX(slot.col) + CELL - 16"
                :cy="slotY(slot.row, rack.rows) + 16"
                r="13"
                fill="var(--accent)"
              />
              <text
                :x="slotX(slot.col) + CELL - 16"
                :y="slotY(slot.row, rack.rows) + 21"
                text-anchor="middle"
                font-size="13"
                font-weight="700"
                fill="var(--accent-text)"
              >
                {{ slot.bottles.length }}
              </text>
            </g>

            <text
              :x="slotX(slot.col) + CELL / 2"
              :y="slotY(slot.row, rack.rows) + CELL - 12"
              text-anchor="middle"
              :font-size="layout.numberFontUnits"
              font-weight="700"
              :fill="
                isHighlighted(slot)
                  ? 'var(--accent)'
                  : slot.bottles.length > 0
                    ? 'var(--text)'
                    : 'var(--text-muted)'
              "
            >
              {{ label(slot) }}
            </text>
          </g>
        </svg>
      </div>
    </div>

    <!-- Bords estompés : signalent qu'il reste du casier au-delà. -->
    <div
      class="pointer-events-none absolute inset-y-0 left-7 w-6 bg-gradient-to-r from-surface to-transparent transition-opacity"
      :class="canScrollLeft ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent transition-opacity"
      :class="canScrollRight ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />

    <template v-if="scrollable">
      <div class="ml-7 mt-2 h-1 rounded-full bg-surface-2" aria-hidden="true">
        <div
          class="h-full rounded-full bg-line-strong"
          :style="{ width: mapWidth, marginLeft: mapOffset }"
        />
      </div>
      <p
        v-if="!hasScrolled"
        class="mt-2 flex items-center justify-center gap-1.5 text-center text-sm text-faint"
      >
        Fais glisser le plan pour voir tout le casier
        <ArrowRightIcon class="h-4 w-4" aria-hidden="true" />
      </p>
    </template>

    <!-- Fiche au survol, hors SVG pour rester lisible. Au doigt, c'est la feuille
         d'aperçu qui prend le relais : le survol n'existe pas sur un écran tactile. -->
    <Transition name="fade">
      <div
        v-if="hoverPointer && tooltip"
        class="pointer-events-none absolute left-1/2 top-2 z-10 w-[min(23rem,92%)] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-float"
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
