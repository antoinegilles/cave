<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottleList from '../components/BottleList.vue'
import RackGrid from '../components/RackGrid.vue'
import SearchPanel from '../components/SearchPanel.vue'
import SlotSheet from '../components/SlotSheet.vue'
import { plural } from '../lib/format'
import { useHoverPointer, useReducedMotion } from '../lib/useMediaQuery'
import type { SlotView } from '../lib/types'
import { useCellarStore } from '../stores/cellar'
import { usePrefsStore } from '../stores/prefs'

const cellar = useCellarStore()
const prefs = usePrefsStore()
const router = useRouter()
const route = useRoute()
const searchPanel = ref<InstanceType<typeof SearchPanel> | null>(null)
const reducedMotion = useReducedMotion()
const hoverPointer = useHoverPointer()
const rackCard = ref<HTMLElement | null>(null)
const sheetSlot = ref<SlotView | null>(null)

onMounted(() => {
  if (cellar.racks.length === 0) cellar.loadRacks()
})

/**
 * L'onglet « Chercher » de la barre basse arrive ici avec `?focus=search`.
 *
 * La query est effacée aussitôt consommée : sans cela, re-toucher l'onglet depuis la vue
 * cave ne changerait pas l'URL et ne redonnerait donc jamais le focus.
 */
watch(
  () => route.query['focus'],
  async (value) => {
    if (value !== 'search') return
    await nextTick()
    searchPanel.value?.focus()
    router.replace({ name: 'cellar' })
  },
  { immediate: true },
)

/** Toutes les bouteilles en cave, tous casiers confondus. */
const allBottles = computed(() =>
  cellar.racks.flatMap((rack) => rack.slots.map((slot) => slot.bottle).filter((b) => b !== null)),
)
const totalWines = computed(() => new Set(allBottles.value.map((bottle) => bottle.wine.id)).size)

/** En recherche, on liste les résultats ; sinon toute la cave. */
const listedBottles = computed(() =>
  cellar.searchActive ? (cellar.searchResult?.bottles ?? []) : allBottles.value,
)

const highlightedIds = computed(
  () => new Set(cellar.searchActive ? (cellar.searchResult?.bottles ?? []).map((b) => b.id) : []),
)

/** Numéros à allumer dans le casier affiché. */
const highlightedNumbers = computed(() => {
  const rack = cellar.activeRack
  if (!rack) return new Set<number>()
  const numbers = new Set<number>()
  for (const key of cellar.highlightedSlots) {
    const [rackId, number] = key.split(':')
    if (rackId === rack.id && number) numbers.add(Number(number))
  }
  return numbers
})

const filledCount = computed(() => cellar.activeRack?.slots.filter((s) => s.bottle).length ?? 0)

/** Emplacement à amener sous les yeux, s'il concerne bien le casier affiché. */
const focusNumber = computed(() =>
  cellar.focusedSlot && cellar.focusedSlot.rackId === cellar.activeRack?.id
    ? cellar.focusedSlot.number
    : null,
)

// Le plan défile tout seul jusqu'à l'emplacement trouvé, encore faut-il qu'il soit à
// l'écran : sur téléphone la carte du casier est sous la recherche et ses filtres.
watch(
  () => [cellar.searchActive, prefs.viewMode, cellar.focusedSlot] as const,
  ([active, mode]) => {
    if (!active || mode !== 'rack') return
    requestAnimationFrame(() =>
      rackCard.value?.scrollIntoView({
        block: 'start',
        behavior: reducedMotion.value ? 'auto' : 'smooth',
      }),
    )
  },
)

/**
 * Au doigt, un appui ouvre l'aperçu ; à la souris, il navigue directement.
 *
 * L'arbitrage porte sur la **capacité du pointeur**, pas sur la largeur de la fenêtre :
 * une fenêtre étroite sur un bureau garde le survol et le clic direct, une tablette large
 * ne les a jamais eus.
 */
function onSelectBottle(slot: SlotView): void {
  if (hoverPointer.value && slot.bottle) {
    router.push({ name: 'bottle', params: { id: slot.bottle.id } })
    return
  }
  sheetSlot.value = slot
}

function onSelectEmpty(slot: SlotView): void {
  if (hoverPointer.value) {
    goToAdd(slot.number)
    return
  }
  sheetSlot.value = slot
}

function goToAdd(slotNumber: number): void {
  sheetSlot.value = null
  router.push({
    name: 'add',
    query: { rackId: cellar.activeRack?.id, slot: String(slotNumber) },
  })
}

function openBottle(bottleId: string): void {
  sheetSlot.value = null
  router.push({ name: 'bottle', params: { id: bottleId } })
}
</script>

<template>
  <div class="space-y-5">
    <SearchPanel ref="searchPanel" />

    <p v-if="cellar.loading" class="py-16 text-center text-muted">Chargement de la cave…</p>

    <p
      v-else-if="cellar.error"
      class="rounded-xl border border-danger bg-danger-soft p-4 text-danger"
    >
      {{ cellar.error }}
    </p>

    <div
      v-else-if="cellar.racks.length === 0"
      class="rounded-2xl border border-line bg-surface p-10 text-center"
    >
      <p class="text-xl font-semibold text-text">Aucun casier configuré</p>
      <p class="mx-auto mt-2 max-w-md text-muted">
        Crée d'abord un casier qui reflète ta cave physique, avec ses rangées et ses colonnes.
      </p>
      <RouterLink
        :to="{ name: 'admin' }"
        class="mt-5 inline-block rounded-xl bg-accent px-6 py-3 font-semibold text-accent-text"
      >
        Configurer un casier
      </RouterLink>
    </div>

    <template v-else>
      <p class="px-1 text-sm text-muted">
        {{ plural(totalWines, 'vin') }} · {{ plural(cellar.totalBottles, 'bouteille') }} ·
        {{ cellar.totalSlots }} emplacements
      </p>

      <!-- Liste -->
      <BottleList
        v-if="prefs.viewMode === 'list'"
        :bottles="listedBottles"
        :rack-order="cellar.racks.map((rack) => rack.id)"
        :highlighted-ids="highlightedIds"
        :empty-message="
          cellar.searchActive
            ? 'Aucun vin ne correspond à cette recherche.'
            : 'Ta cave est vide — ajoute ta première bouteille.'
        "
      />

      <!-- Plan du casier -->
      <template v-else>
        <div v-if="cellar.racks.length > 1" class="flex flex-wrap gap-2">
          <button
            v-for="rack in cellar.racks"
            :key="rack.id"
            type="button"
            class="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            :class="
              cellar.activeRack?.id === rack.id
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line text-muted hover:bg-surface-hover'
            "
            @click="cellar.activeRackId = rack.id"
          >
            {{ rack.name }}
          </button>
        </div>

        <div
          v-if="cellar.activeRack"
          ref="rackCard"
          class="rounded-2xl border border-line bg-surface p-3 sm:p-5"
        >
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
            <h1 class="font-display text-xl font-semibold text-text">
              {{ cellar.activeRack.name }}
            </h1>
            <p class="text-sm text-muted">
              {{ filledCount }} / {{ cellar.activeRack.slots.length }} occupés
            </p>
          </div>

          <RackGrid
            :rack="cellar.activeRack"
            :highlighted-numbers="highlightedNumbers"
            :search-active="cellar.searchActive"
            :focus-number="focusNumber"
            @select-bottle="onSelectBottle"
            @select-empty="onSelectEmpty"
          />

          <p aria-live="polite" class="sr-only">
            <template v-if="focusNumber !== null">
              Le plan s'est positionné sur l'emplacement {{ focusNumber }}.
            </template>
          </p>

          <p class="mt-3 px-1 text-center text-sm text-faint">
            Touche un emplacement pour voir la bouteille, ou pour en ranger une.
          </p>
        </div>

        <SlotSheet
          :slot="sheetSlot"
          :rack-name="cellar.activeRack?.name ?? ''"
          :show-rack="cellar.racks.length > 1"
          @close="sheetSlot = null"
          @open="openBottle"
          @fill="goToAdd"
        />
      </template>
    </template>
  </div>
</template>
