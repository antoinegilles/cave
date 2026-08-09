<script setup lang="ts">
import { STRUCTURE_LABELS, WINE_COLOR_LABELS, type StructureAxis } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import type { BottleView as Bottle } from '../lib/types'
import { useCellarStore } from '../stores/cellar'

const route = useRoute()
const router = useRouter()
const cellar = useCellarStore()

const bottle = ref<Bottle | null>(null)
const window_ = ref<{ from: number; to: number } | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const drinkOpen = ref(false)
const drinkRating = ref<number | null>(null)
const drinkNote = ref('')
const saving = ref(false)

onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  try {
    const data = await api.get<{ bottle: Bottle; drinkingWindow: { from: number; to: number } | null }>(
      `/api/bottles/${route.params['id']}`,
    )
    bottle.value = data.bottle
    window_.value = data.drinkingWindow
    drinkNote.value = data.bottle.personalNote ?? ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

/** Axes réellement renseignés — on n'affiche pas une jauge vide. */
const structureRows = computed(() => {
  const structure = bottle.value?.wine.structure
  if (!structure) return []
  return (Object.keys(STRUCTURE_LABELS) as StructureAxis[])
    .filter((axis) => structure[axis] !== null)
    .map((axis) => ({ axis, label: STRUCTURE_LABELS[axis], value: structure[axis] as number }))
})

const windowStatus = computed(() => {
  if (!window_.value) return null
  const year = new Date().getFullYear()
  if (year > window_.value.to) return { label: 'Probablement passé son apogée', tone: 'warn' }
  if (year >= window_.value.from) return { label: 'À boire maintenant', tone: 'good' }
  return { label: `À attendre jusqu'à ${window_.value.from}`, tone: 'wait' }
})

async function drink(): Promise<void> {
  if (!bottle.value || saving.value) return
  saving.value = true
  try {
    await api.post(`/api/bottles/${bottle.value.id}/drink`, {
      personalRating: drinkRating.value,
      personalNote: drinkNote.value.trim() || null,
    })
    await cellar.loadRacks()
    router.push({ name: 'cellar' })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!bottle.value) return
  if (!confirm('Supprimer définitivement cette bouteille et son historique ?')) return
  await api.delete(`/api/bottles/${bottle.value.id}`)
  await cellar.loadRacks()
  router.push({ name: 'cellar' })
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <button type="button" class="text-sm text-muted" @click="router.back()">← Retour</button>

    <p v-if="loading" class="py-12 text-center text-muted">Chargement…</p>
    <p v-else-if="error" class="rounded-lg bg-danger-soft px-4 py-2.5 text-danger">{{ error }}</p>

    <template v-else-if="bottle">
      <div class="rounded-2xl border border-line bg-surface p-5">
        <div class="flex gap-4">
          <img
            v-if="bottle.wine.imageUrl"
            :src="bottle.wine.imageUrl"
            alt=""
            class="h-32 w-24 shrink-0 rounded-lg object-contain"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h1 class="font-display text-xl text-text">{{ bottle.wine.name }}</h1>
                <p v-if="bottle.wine.producer" class="text-muted">{{ bottle.wine.producer }}</p>
              </div>
              <span
                v-if="bottle.slotNumber !== null"
                class="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-lg font-bold text-accent-text"
              >
                n° {{ bottle.slotNumber }}
              </span>
            </div>

            <p class="mt-2 text-sm text-muted">
              {{
                [
                  bottle.wine.vintage,
                  bottle.wine.color ? WINE_COLOR_LABELS[bottle.wine.color as keyof typeof WINE_COLOR_LABELS] : null,
                  bottle.wine.region,
                  bottle.wine.country,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>

            <div class="mt-3 flex flex-wrap items-center gap-3">
              <span
                v-if="bottle.wine.vivinoRating"
                class="rounded-lg bg-surface-2 px-3 py-1.5 text-sm"
              >
                <strong class="text-brass">★ {{ bottle.wine.vivinoRating.toFixed(1) }}</strong>
                <span class="text-faint">
                  / {{ bottle.wine.vivinoRatingCount?.toLocaleString('fr-FR') }} avis
                </span>
              </span>
              <a
                v-if="bottle.wine.vivinoUrl"
                :href="bottle.wine.vivinoUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm text-muted underline decoration-dotted"
              >
                Voir sur Vivino ↗
              </a>
            </div>
          </div>
        </div>

        <div
          v-if="windowStatus"
          class="mt-4 rounded-lg px-3 py-2 text-sm"
          :class="{
            'bg-success-soft text-success': windowStatus.tone === 'good',
            'bg-warning-soft text-warning': windowStatus.tone === 'warn',
            'bg-surface-2 text-muted': windowStatus.tone === 'wait',
          }"
        >
          {{ windowStatus.label }}
          <span v-if="window_" class="opacity-70">
            (apogée estimée {{ window_.from }}–{{ window_.to }})
          </span>
        </div>
      </div>

      <!-- Accords : la raison d'être de l'app -->
      <div v-if="bottle.wine.foodTags.length" class="rounded-2xl border border-line bg-surface p-5">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          À servir avec
        </h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="food in bottle.wine.foodTags"
            :key="food.slug"
            class="rounded-full bg-surface-2 px-3 py-1.5 text-sm text-muted"
          >
            {{ food.emoji }} {{ food.labelFr }}
          </span>
        </div>
      </div>

      <div
        v-if="structureRows.length || bottle.wine.grapes.length || bottle.wine.flavors.length"
        class="space-y-4 rounded-2xl border border-line bg-surface p-5"
      >
        <div v-if="structureRows.length">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Profil</h2>
          <div class="space-y-2">
            <div v-for="row in structureRows" :key="row.axis" class="flex items-center gap-3">
              <span class="w-28 shrink-0 text-sm text-muted">{{ row.label }}</span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  class="h-full rounded-full bg-brass"
                  :style="{ width: `${(row.value / 5) * 100}%` }"
                />
              </div>
              <span class="w-8 shrink-0 text-right text-sm tabular-nums text-muted">
                {{ row.value.toFixed(1) }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="bottle.wine.grapes.length">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Cépages</h2>
          <p class="text-text">{{ bottle.wine.grapes.join(', ') }}</p>
        </div>

        <div v-if="bottle.wine.flavors.length">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Arômes</h2>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="flavor in bottle.wine.flavors"
              :key="flavor"
              class="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted"
            >
              {{ flavor }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="bottle.personalNote" class="rounded-2xl border border-line bg-surface p-5">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Note personnelle
        </h2>
        <p class="whitespace-pre-wrap text-text">{{ bottle.personalNote }}</p>
      </div>

      <!-- Ouvrir la bouteille -->
      <div v-if="bottle.status === 'IN_CELLAR'" class="space-y-3">
        <button
          v-if="!drinkOpen"
          type="button"
          class="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-accent-text shadow-card transition-colors hover:bg-accent-hover"
          @click="drinkOpen = true"
        >
          🍷 J'ouvre cette bouteille
        </button>

        <div v-else class="space-y-4 rounded-2xl border-2 border-accent bg-surface p-5">
          <p class="font-medium text-text">
            L'emplacement <strong>n° {{ bottle.slotNumber }}</strong> sera libéré et la bouteille
            rejoindra ton historique.
          </p>

          <div>
            <label class="mb-2 block text-sm font-medium text-muted">Ta note</label>
            <div class="flex gap-1">
              <button
                v-for="star in 5"
                :key="star"
                type="button"
                class="px-1 text-4xl leading-none transition-transform hover:scale-110"
                :class="(drinkRating ?? 0) >= star ? 'text-brass' : 'text-line-strong'"
                :aria-label="`Noter ${star} sur 5`"
                :aria-pressed="(drinkRating ?? 0) >= star"
                @click="drinkRating = drinkRating === star ? null : star"
              >
                ★
              </button>
            </div>
          </div>

          <div>
            <label for="drink-note" class="mb-1.5 block text-sm font-medium text-muted">
              Impression
            </label>
            <textarea
              id="drink-note"
              v-model="drinkNote"
              rows="3"
              placeholder="Servi sur un gigot, encore un peu fermé à l'ouverture…"
              class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
            />
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              class="rounded-xl border border-line px-5 py-3 font-medium text-muted transition-colors hover:bg-surface-hover"
              @click="drinkOpen = false"
            >
              Annuler
            </button>
            <button
              type="button"
              class="flex-1 rounded-xl bg-accent py-3 font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              :disabled="saving"
              @click="drink"
            >
              {{ saving ? 'Enregistrement…' : 'Confirmer' }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-muted">
          Bue le
          {{ bottle.drunkAt ? new Date(bottle.drunkAt).toLocaleDateString('fr-FR') : '—' }}
          <span v-if="bottle.personalRating"> · ta note : ★ {{ bottle.personalRating }}/5</span>
        </p>
      </div>

      <!-- Action destructrice : un vrai bouton, mais volontairement en second plan
           (contour plutôt que fond plein) pour ne pas concurrencer l'action principale. -->
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-danger bg-transparent py-3 font-medium text-danger transition-colors hover:bg-danger-soft"
        @click="remove"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
        Supprimer cette bouteille
      </button>
    </template>
  </div>
</template>
