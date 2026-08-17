<script setup lang="ts">
import { STRUCTURE_LABELS, WINE_COLOR_LABELS, type StructureAxis } from '@cave/shared'
import { ArrowLeftIcon, CheckCircleIcon, PencilSquareIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomSheet from '../components/BottomSheet.vue'
import ConfirmSheet from '../components/ConfirmSheet.vue'
import MeterRow from '../components/MeterRow.vue'
import { ApiError, api } from '../lib/api'
import {
  formatDrinkCta,
  formatOpenedNotification,
  initialBottleSelection,
} from '../lib/bottleActions'
import { decimalFr } from '../lib/format'
import type {
  BottleDetailView,
  BottleView as Bottle,
  DrinkBottlesResult,
} from '../lib/types'
import { useCellarStore } from '../stores/cellar'
import { useNotificationsStore } from '../stores/notifications'

const route = useRoute()
const router = useRouter()
const cellar = useCellarStore()
const notifications = useNotificationsStore()

const bottle = ref<Bottle | null>(null)
const activeBottles = ref<Bottle[]>([])
const window_ = ref<{ from: number; to: number } | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)

const drinkOpen = ref(false)
const selectedBottleIds = ref<string[]>([])
const drinkRating = ref<number | null>(null)
const drinkNote = ref('')
const saving = ref(false)
const editingTasting = ref(false)
const editRating = ref<number | null>(null)
const editNote = ref('')
const savingTasting = ref(false)

onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const data = await api.get<BottleDetailView>(`/api/bottles/${route.params['id']}`)
    bottle.value = data.bottle
    activeBottles.value = data.activeBottles
    window_.value = data.drinkingWindow
    drinkNote.value = data.bottle.personalNote ?? ''
    editRating.value = data.bottle.personalRating
    editNote.value = data.bottle.personalNote ?? ''
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const selectableBottles = computed(() =>
  activeBottles.value.filter((activeBottle) => activeBottle.slotNumber !== null),
)

const selectedBottles = computed(() => {
  const selected = new Set(selectedBottleIds.value)
  return selectableBottles.value.filter((activeBottle) => selected.has(activeBottle.id))
})

const allSelected = computed(
  () =>
    selectableBottles.value.length > 0 &&
    selectedBottleIds.value.length === selectableBottles.value.length,
)

const drinkCta = computed(() => formatDrinkCta(selectedBottles.value))

function bottleLocation(activeBottle: Bottle): string {
  if (activeBottle.slotNumber === null) return 'Emplacement indisponible'
  return [activeBottle.rackName, `n° ${activeBottle.slotNumber}`].filter(Boolean).join(' · ')
}

function openDrinkSheet(): void {
  selectedBottleIds.value = initialBottleSelection(activeBottles.value, bottle.value?.id)
  actionError.value = null
  drinkOpen.value = true
}

function toggleAllBottles(): void {
  selectedBottleIds.value = allSelected.value
    ? []
    : selectableBottles.value.map((activeBottle) => activeBottle.id)
}

function closeDrinkSheet(): void {
  if (saving.value) return
  drinkOpen.value = false
  actionError.value = null
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
  if (selectedBottleIds.value.length === 0 || saving.value) return
  saving.value = true
  actionError.value = null
  try {
    const result = await api.post<DrinkBottlesResult>('/api/bottles/drink', {
      bottleIds: selectedBottleIds.value,
      personalRating: drinkRating.value,
      personalNote: drinkNote.value.trim() || null,
    })
    await cellar.loadRacks()
    notifications.show(formatOpenedNotification(result.freedSlots))
    router.push({ name: 'cellar' })
  } catch (e) {
    actionError.value = (e as Error).message
    if (e instanceof ApiError && e.status === 409) {
      await load()
      selectedBottleIds.value = initialBottleSelection(activeBottles.value, bottle.value?.id)
      if (bottle.value?.status !== 'IN_CELLAR' || selectableBottles.value.length === 0) {
        drinkOpen.value = false
      }
    }
  } finally {
    saving.value = false
  }
}

function startTastingEdit(): void {
  if (!bottle.value) return
  editRating.value = bottle.value.personalRating
  editNote.value = bottle.value.personalNote ?? ''
  actionError.value = null
  editingTasting.value = true
}

function cancelTastingEdit(): void {
  if (savingTasting.value) return
  editingTasting.value = false
  actionError.value = null
}

async function saveTasting(): Promise<void> {
  if (!bottle.value || savingTasting.value) return
  savingTasting.value = true
  actionError.value = null
  try {
    const result = await api.patch<{ bottle: Bottle }>(`/api/bottles/${bottle.value.id}`, {
      personalRating: editRating.value,
      personalNote: editNote.value.trim() || null,
    })
    bottle.value = result.bottle
    editingTasting.value = false
    notifications.show('Dégustation mise à jour.')
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    savingTasting.value = false
  }
}

const confirmingRemove = ref(false)
const removing = ref(false)

async function remove(): Promise<void> {
  if (!bottle.value) return
  removing.value = true
  actionError.value = null
  try {
    await api.delete(`/api/bottles/${bottle.value.id}`)
    await cellar.loadRacks()
    notifications.show('Bouteille supprimée.')
    router.push({ name: 'cellar' })
  } catch (e) {
    actionError.value = (e as Error).message
    notifications.show(actionError.value, 'error')
  } finally {
    removing.value = false
    if (!actionError.value) confirmingRemove.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <button type="button" class="inline-flex items-center gap-1.5 rounded-lg text-sm text-muted hover:text-text" @click="router.back()">
      <ArrowLeftIcon class="h-4 w-4" aria-hidden="true" /> Retour
    </button>

    <p v-if="loading" class="py-12 text-center text-muted">Chargement…</p>
    <p v-else-if="loadError" class="rounded-lg bg-danger-soft px-4 py-2.5 text-danger">
      {{ loadError }}
    </p>

    <template v-else-if="bottle">
      <div class="rounded-2xl border border-line bg-surface p-5">
        <div class="flex flex-col gap-4 sm:flex-row">
          <img
            v-if="bottle.wine.imageUrl"
            :src="bottle.wine.imageUrl"
            alt=""
            class="mx-auto h-32 w-24 shrink-0 rounded-lg object-contain sm:mx-0"
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
                n° {{ bottle.slotNumber }}<template v-if="activeBottles.length > 1">
                  +{{ activeBottles.length - 1 }}</template
                >
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

      <div
        v-if="bottle.status === 'IN_CELLAR'"
        class="rounded-2xl border border-line bg-surface p-5"
      >
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {{ activeBottles.length }}
          {{ activeBottles.length > 1 ? 'exemplaires en cave' : 'exemplaire en cave' }}
        </h2>
        <ul class="flex flex-wrap gap-2" aria-label="Emplacements de ce vin">
          <li
            v-for="activeBottle in activeBottles"
            :key="activeBottle.id"
            class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text"
            :class="activeBottle.slotNumber === null ? 'text-warning' : ''"
          >
            {{ bottleLocation(activeBottle) }}
          </li>
        </ul>
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
          <div class="space-y-3">
            <MeterRow
              v-for="row in structureRows"
              :key="row.axis"
              :label="row.label"
              :value="decimalFr(row.value)"
              :percent="(row.value / 5) * 100"
            />
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

      <div
        v-if="bottle.personalNote && bottle.status === 'IN_CELLAR'"
        class="rounded-2xl border border-line bg-surface p-5"
      >
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Note personnelle
        </h2>
        <p class="whitespace-pre-wrap text-text">{{ bottle.personalNote }}</p>
      </div>

      <p
        v-if="actionError"
        role="alert"
        class="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-danger"
      >
        {{ actionError }}
      </p>

      <!-- Ouvrir un ou plusieurs exemplaires du groupe -->
      <div v-if="bottle.status === 'IN_CELLAR'">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-lg font-semibold text-accent-text shadow-card transition-colors hover:bg-accent-hover"
          @click="openDrinkSheet"
        >
          <CheckCircleIcon class="h-6 w-6" aria-hidden="true" /> J'ouvre une bouteille
        </button>
      </div>

      <div v-else class="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="font-display text-lg font-semibold text-text">Dégustation</h2>
            <p class="text-sm text-muted">
              Bue le
              {{ bottle.drunkAt ? new Date(bottle.drunkAt).toLocaleDateString('fr-FR') : '—' }}
            </p>
          </div>
          <button
            v-if="!editingTasting"
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
            @click="startTastingEdit"
          >
            <PencilSquareIcon class="h-5 w-5" aria-hidden="true" /> Modifier
          </button>
        </div>

        <template v-if="editingTasting">
          <fieldset>
            <div class="mb-2 flex items-center justify-between gap-3">
              <legend class="text-sm font-medium text-muted">Ta note</legend>
              <button
                v-if="editRating !== null"
                type="button"
                class="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-hover hover:text-text"
                @click="editRating = null"
              >
                Effacer
              </button>
            </div>
            <div class="flex gap-1">
              <button
                v-for="star in 5"
                :key="star"
                type="button"
                class="px-1 text-4xl leading-none transition-transform hover:scale-110"
                :class="(editRating ?? 0) >= star ? 'text-brass' : 'text-line-strong'"
                :aria-label="`Noter ${star} sur 5`"
                :aria-pressed="(editRating ?? 0) >= star"
                @click="editRating = editRating === star ? null : star"
              >
                ★
              </button>
            </div>
          </fieldset>

          <div>
            <label for="edit-note" class="mb-1.5 block text-sm font-medium text-muted">
              Impression
            </label>
            <textarea
              id="edit-note"
              v-model="editNote"
              rows="3"
              maxlength="2000"
              placeholder="Servi sur un gigot, encore un peu fermé à l'ouverture…"
              class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
            />
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              class="min-h-11 rounded-xl border border-line px-5 font-medium text-muted transition-colors hover:bg-surface-hover"
              :disabled="savingTasting"
              @click="cancelTastingEdit"
            >
              Annuler
            </button>
            <button
              type="button"
              class="min-h-11 flex-1 rounded-xl bg-accent px-5 font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              :disabled="savingTasting"
              @click="saveTasting"
            >
              {{ savingTasting ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </template>

        <template v-else>
          <p v-if="bottle.personalRating" class="text-lg font-bold text-brass">
            ★ {{ bottle.personalRating }}/5
          </p>
          <p v-else class="text-sm text-muted">Aucune note attribuée.</p>
          <p v-if="bottle.personalNote" class="whitespace-pre-wrap text-text">
            {{ bottle.personalNote }}
          </p>
          <p v-else class="text-sm text-muted">Aucune impression renseignée.</p>
        </template>
      </div>

      <!-- Action destructrice : un vrai bouton, mais volontairement en second plan
           (contour plutôt que fond plein) pour ne pas concurrencer l'action principale. -->
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-danger bg-transparent py-3 font-medium text-danger transition-colors hover:bg-danger-soft"
        @click="confirmingRemove = true"
      >
        <TrashIcon class="h-5 w-5" aria-hidden="true" />
        Supprimer cette bouteille
      </button>

      <ConfirmSheet
        :open="confirmingRemove"
        title="Supprimer cette bouteille ?"
        message="La bouteille et son historique de dégustation seront définitivement effacés."
        confirm-label="Supprimer"
        danger
        :busy="removing"
        @confirm="remove"
        @cancel="confirmingRemove = false"
      />

      <BottomSheet
        :open="drinkOpen"
        title="Quels emplacements ouvrir ?"
        :dismiss-on-backdrop="!saving"
        @close="closeDrinkSheet"
      >
        <div class="space-y-5">
          <div>
            <div class="mb-2 flex items-center justify-between gap-3">
              <p class="text-sm text-muted">
                Sélectionne un ou plusieurs emplacements. Ils seront libérés ensemble.
              </p>
              <button
                type="button"
                class="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
                :aria-pressed="allSelected"
                :disabled="saving"
                @click="toggleAllBottles"
              >
                {{ allSelected ? 'Tout désélectionner' : 'Tout sélectionner' }}
              </button>
            </div>

            <fieldset class="space-y-2">
              <legend class="sr-only">Emplacements à ouvrir</legend>
              <label
                v-for="activeBottle in activeBottles"
                :key="activeBottle.id"
                class="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 py-2"
                :class="
                  activeBottle.slotNumber === null
                    ? 'cursor-not-allowed bg-surface-2 text-warning'
                    : 'cursor-pointer hover:bg-surface-hover'
                "
              >
                <input
                  v-model="selectedBottleIds"
                  type="checkbox"
                  :value="activeBottle.id"
                  :disabled="activeBottle.slotNumber === null || saving"
                  class="h-5 w-5 rounded border-line text-accent focus:ring-accent"
                />
                <span class="min-w-0 flex-1 font-medium text-text">
                  {{ bottleLocation(activeBottle) }}
                </span>
              </label>
            </fieldset>
          </div>

          <fieldset>
            <div class="mb-2 flex items-center justify-between gap-3">
              <legend class="text-sm font-medium text-muted">Ta note commune</legend>
              <button
                v-if="drinkRating !== null"
                type="button"
                class="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-hover hover:text-text"
                @click="drinkRating = null"
              >
                Effacer
              </button>
            </div>
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
          </fieldset>

          <div>
            <label for="drink-note" class="mb-1.5 block text-sm font-medium text-muted">
              Impression commune
            </label>
            <textarea
              id="drink-note"
              v-model="drinkNote"
              rows="3"
              maxlength="2000"
              placeholder="Servi sur un gigot, encore un peu fermé à l'ouverture…"
              class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
            />
          </div>

          <p
            v-if="actionError"
            role="alert"
            class="rounded-xl border border-danger bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {{ actionError }}
          </p>
        </div>

        <template #actions>
          <div class="flex gap-3">
            <button
              type="button"
              class="min-h-11 rounded-xl border border-line px-5 font-medium text-muted transition-colors hover:bg-surface-hover"
              :disabled="saving"
              @click="closeDrinkSheet"
            >
              Annuler
            </button>
            <button
              type="button"
              class="min-h-11 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              :disabled="saving || selectedBottleIds.length === 0"
              @click="drink"
            >
              {{ saving ? 'Ouverture…' : drinkCta }}
            </button>
          </div>
        </template>
      </BottomSheet>
    </template>
  </div>
</template>
