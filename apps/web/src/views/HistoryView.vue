<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../lib/api'
import type { BottleView, DrinkSoonEntry } from '../lib/types'
import { useCellarStore } from '../stores/cellar'

/**
 * Historique de dégustation et bouteilles à ouvrir.
 *
 * C'est précisément ce que Vivino facturait : se souvenir de ce qu'on a bu, quand, et ce
 * qu'on en a pensé — plus savoir ce qu'il faut ouvrir avant qu'il ne soit trop tard.
 */

const tab = ref<'soon' | 'history'>('soon')
const history = ref<BottleView[]>([])
const drinkSoon = ref<DrinkSoonEntry[]>([])
const loading = ref(true)
const cellar = useCellarStore()

onMounted(async () => {
  try {
    const [soon, hist] = await Promise.all([
      api.get<{ bottles: DrinkSoonEntry[] }>(cellar.readPath('/api/stats/drink-soon')),
      api.get<{ bottles: BottleView[] }>(cellar.readPath('/api/stats/history')),
    ])
    drinkSoon.value = soon.bottles
    history.value = hist.bottles
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—'
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-lg border px-4 py-2 text-sm transition-colors"
        :class="
          tab === 'soon'
            ? 'border-accent bg-accent-soft font-medium text-accent'
            : 'border-line text-muted'
        "
        @click="tab = 'soon'"
      >
        À ouvrir bientôt<span v-if="drinkSoon.length"> · {{ drinkSoon.length }}</span>
      </button>
      <button
        type="button"
        class="rounded-lg border px-4 py-2 text-sm transition-colors"
        :class="
          tab === 'history'
            ? 'border-accent bg-accent-soft font-medium text-accent'
            : 'border-line text-muted'
        "
        @click="tab = 'history'"
      >
        Déjà bues<span v-if="history.length"> · {{ history.length }}</span>
      </button>
    </div>

    <p v-if="loading" class="py-12 text-center text-muted">Chargement…</p>

    <template v-else-if="tab === 'soon'">
      <p v-if="drinkSoon.length === 0" class="rounded-xl border border-line bg-surface p-8 text-center text-muted">
        Rien ne presse : aucune bouteille n'approche la fin de sa fenêtre de dégustation.
      </p>

      <RouterLink
        v-for="entry in drinkSoon"
        :key="entry.bottle.id"
        :to="{ name: 'bottle', params: { id: entry.bottle.id } }"
        class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-hover"
      >
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-bold text-brass"
        >
          {{ entry.bottle.slotNumber ?? '–' }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-text">{{ entry.bottle.wine.name }}</p>
          <p class="truncate text-sm text-muted">
            {{ [entry.bottle.wine.producer, entry.bottle.wine.vintage].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <span
          class="shrink-0 rounded px-2 py-1 text-xs font-medium"
          :class="
            entry.status === 'PAST' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
          "
        >
          {{ entry.status === 'PAST' ? 'Passé' : `Jusqu'à ${entry.window.to}` }}
        </span>
      </RouterLink>
    </template>

    <template v-else>
      <p v-if="history.length === 0" class="rounded-xl border border-line bg-surface p-8 text-center text-muted">
        Aucune bouteille bue pour l'instant.
      </p>

      <div
        v-for="bottle in history"
        :key="bottle.id"
        class="rounded-xl border border-line bg-surface p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <RouterLink
              :to="{ name: 'bottle', params: { id: bottle.id } }"
              class="font-medium text-text hover:text-accent"
            >
              {{ bottle.wine.name }}
            </RouterLink>
            <p class="text-sm text-muted">
              {{ [bottle.wine.producer, bottle.wine.region, bottle.wine.vintage].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <span v-if="bottle.personalRating" class="shrink-0 font-bold text-brass">
            ★ {{ bottle.personalRating }}
          </span>
        </div>

        <p class="mt-2 text-xs text-faint">Bue le {{ formatDate(bottle.drunkAt) }}</p>

        <p v-if="bottle.personalNote" class="mt-2 whitespace-pre-wrap text-sm italic text-muted">
          « {{ bottle.personalNote }} »
        </p>
      </div>
    </template>
  </div>
</template>
