<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottleList from '../components/BottleList.vue'
import RackGrid from '../components/RackGrid.vue'
import SearchPanel from '../components/SearchPanel.vue'
import type { SlotView } from '../lib/types'
import { useCellarStore } from '../stores/cellar'
import { usePrefsStore } from '../stores/prefs'

const cellar = useCellarStore()
const prefs = usePrefsStore()
const router = useRouter()

onMounted(() => {
  if (cellar.racks.length === 0) cellar.loadRacks()
})

/** Toutes les bouteilles en cave, tous casiers confondus. */
const allBottles = computed(() =>
  cellar.racks.flatMap((rack) => rack.slots.map((slot) => slot.bottle).filter((b) => b !== null)),
)

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

function onSelectBottle(slot: SlotView): void {
  if (slot.bottle) router.push({ name: 'bottle', params: { id: slot.bottle.id } })
}

function onSelectEmpty(slot: SlotView): void {
  router.push({
    name: 'add',
    query: { rackId: cellar.activeRack?.id, slot: String(slot.number) },
  })
}
</script>

<template>
  <div class="space-y-5">
    <SearchPanel />

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
      <!-- Bascule d'affichage : liste par défaut, plan pour se repérer physiquement -->
      <div class="flex items-center justify-between gap-3">
        <div
          class="inline-flex rounded-xl border border-line bg-surface p-1"
          role="tablist"
          aria-label="Mode d'affichage"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="prefs.viewMode === 'list'"
            class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            :class="
              prefs.viewMode === 'list' ? 'bg-accent text-accent-text' : 'text-muted hover:text-text'
            "
            @click="prefs.viewMode = 'list'"
          >
            Liste
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="prefs.viewMode === 'rack'"
            class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            :class="
              prefs.viewMode === 'rack' ? 'bg-accent text-accent-text' : 'text-muted hover:text-text'
            "
            @click="prefs.viewMode = 'rack'"
          >
            Plan du casier
          </button>
        </div>

        <p class="text-sm text-muted">
          {{ cellar.totalBottles }} bouteille(s) · {{ cellar.totalSlots }} emplacements
        </p>
      </div>

      <!-- Liste -->
      <BottleList
        v-if="prefs.viewMode === 'list'"
        :bottles="listedBottles"
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

        <div v-if="cellar.activeRack" class="rounded-2xl border border-line bg-surface p-3 sm:p-5">
          <div class="mb-3 flex items-baseline justify-between px-1">
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
            @select-bottle="onSelectBottle"
            @select-empty="onSelectEmpty"
          />

          <p class="mt-3 px-1 text-center text-sm text-faint">
            Touche un emplacement occupé pour la fiche, un emplacement libre pour y ranger une
            bouteille.
          </p>
        </div>
      </template>
    </template>
  </div>
</template>
