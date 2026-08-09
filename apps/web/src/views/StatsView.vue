<script setup lang="ts">
import { WINE_COLOR_HEX, WINE_COLOR_LABELS, type WineColor } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api'

interface Stats {
  inCellar: number
  drunk: number
  estimatedValue: number
  averageRating: number | null
  byColor: Record<string, number>
  byRegion: Record<string, number>
  byVintage: Record<string, number>
}

const stats = ref<Stats | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    stats.value = await api.get<Stats>('/api/stats')
  } finally {
    loading.value = false
  }
})

const colorRows = computed(() => {
  if (!stats.value) return []
  const total = Object.values(stats.value.byColor).reduce((a, b) => a + b, 0) || 1
  return Object.entries(stats.value.byColor)
    .sort((a, b) => b[1] - a[1])
    .map(([color, count]) => ({
      color,
      label: WINE_COLOR_LABELS[color as WineColor] ?? 'Inconnu',
      hex: WINE_COLOR_HEX[color as WineColor] ?? '#6b7280',
      count,
      percent: Math.round((count / total) * 100),
    }))
})

const regionRows = computed(() => {
  if (!stats.value) return []
  const max = Math.max(...Object.values(stats.value.byRegion), 1)
  return Object.entries(stats.value.byRegion).map(([region, count]) => ({
    region,
    count,
    percent: Math.round((count / max) * 100),
  }))
})
</script>

<template>
  <div class="space-y-5">
    <h1 class="font-display text-2xl text-brass">Ta cave en chiffres</h1>

    <p v-if="loading" class="py-12 text-center text-muted">Chargement…</p>

    <template v-else-if="stats">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-xl border border-line bg-surface p-4">
          <p class="text-2xl font-bold text-brass">{{ stats.inCellar }}</p>
          <p class="text-xs text-muted">bouteilles en cave</p>
        </div>
        <div class="rounded-xl border border-line bg-surface p-4">
          <p class="text-2xl font-bold text-brass">{{ stats.drunk }}</p>
          <p class="text-xs text-muted">déjà dégustées</p>
        </div>
        <div class="rounded-xl border border-line bg-surface p-4">
          <p class="text-2xl font-bold text-brass">
            {{ stats.estimatedValue.toLocaleString('fr-FR') }} €
          </p>
          <p class="text-xs text-muted">valeur estimée</p>
        </div>
        <div class="rounded-xl border border-line bg-surface p-4">
          <p class="text-2xl font-bold text-brass">
            {{ stats.averageRating !== null ? `★ ${stats.averageRating}` : '—' }}
          </p>
          <p class="text-xs text-muted">note Vivino moyenne</p>
        </div>
      </div>

      <div class="rounded-xl border border-line bg-surface p-5">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Répartition par couleur
        </h2>
        <div v-if="colorRows.length === 0" class="text-sm text-faint">Cave vide.</div>
        <div v-else class="space-y-2">
          <div v-for="row in colorRows" :key="row.color" class="flex items-center gap-3">
            <span class="w-28 shrink-0 text-sm text-muted">{{ row.label }}</span>
            <div class="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                class="h-full rounded-full transition-all"
                :style="{ width: `${row.percent}%`, backgroundColor: row.hex }"
              />
            </div>
            <span class="w-16 shrink-0 text-right text-sm tabular-nums text-muted">
              {{ row.count }} · {{ row.percent }}%
            </span>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-line bg-surface p-5">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Principales régions
        </h2>
        <div v-if="regionRows.length === 0" class="text-sm text-faint">Aucune région connue.</div>
        <div v-else class="space-y-2">
          <div v-for="row in regionRows" :key="row.region" class="flex items-center gap-3">
            <span class="w-40 shrink-0 truncate text-sm text-muted">{{ row.region }}</span>
            <div class="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full bg-accent" :style="{ width: `${row.percent}%` }" />
            </div>
            <span class="w-8 shrink-0 text-right text-sm tabular-nums text-muted">
              {{ row.count }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
