<script setup lang="ts">
import { WINE_COLORS, WINE_COLOR_LABELS } from '@cave/shared'
import { CameraIcon, MagnifyingGlassIcon, TagIcon } from '@heroicons/vue/24/outline'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomSheet from '../components/BottomSheet.vue'
import { ApiError, api } from '../lib/api'
import { prepareImage } from '../lib/image'
import type { CandidateView, ResolveResult, WineView } from '../lib/types'
import { useCellarStore } from '../stores/cellar'

/**
 * Ajout d'une bouteille.
 *
 * Trois voies de saisie, aucune bloquante : photo de l'étiquette, code-barres, ou
 * recherche par nom — plus la saisie entièrement manuelle. Toutes convergent vers le
 * même formulaire éditable, dont le numéro d'emplacement est le champ décisif.
 */

const route = useRoute()
const router = useRouter()
const cellar = useCellarStore()

type Step = 'choose' | 'form'
const step = ref<Step>('choose')

const loading = ref(false)
const loadingLabel = ref('')
const error = ref<string | null>(null)
const warning = ref<string | null>(null)
/** Erreurs Zod remontées par l'API, indexées par chemin de champ. */
const fieldErrors = ref<Record<string, string>>({})
const candidates = ref<CandidateView[]>([])
const previewUrl = ref<string | null>(null)

const wine = ref<WineView | null>(null)
const rackId = ref<string>('')
const slotNumber = ref<number | null>(null)
const personalNote = ref('')
const purchasePrice = ref<number | string | null>(null)

const manualQuery = ref('')
const barcode = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  if (cellar.racks.length === 0) await cellar.loadRacks()

  const queryRack = route.query['rackId']
  const querySlot = route.query['slot']
  rackId.value = (typeof queryRack === 'string' ? queryRack : '') || cellar.racks[0]?.id || ''
  if (typeof querySlot === 'string') slotNumber.value = Number(querySlot)
})

/**
 * Un `<input type="number">` vidé renvoie la chaîne vide, que le modificateur `.number`
 * de Vue laisse passer telle quelle. Sans cette normalisation, effacer le prix ou le
 * millésime provoquait un 400 « Expected number, received string ».
 */
function numberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const activeRack = computed(() => cellar.racks.find((r) => r.id === rackId.value) ?? null)

const freeSlots = computed(() => {
  const rack = activeRack.value
  if (!rack) return []
  return rack.slots.filter((s) => !s.bottle || s.number === slotNumber.value)
})

/**
 * Nombre de pastilles montrées d'emblée.
 *
 * Les emplacements libres tenaient dans un `max-h-40 overflow-y-auto` : un conteneur
 * défilant de 170 px, imbriqué dans une page qui défile déjà — un piège classique, et
 * intenable depuis que les casiers ne sont plus bornés à 30 × 30. Les plus proches du
 * numéro saisi suffisent ; le reste passe par une feuille, seul conteneur défilant.
 */
const VISIBLE_FREE_SLOTS = 18
const slotSheetOpen = ref(false)

const visibleFreeSlots = computed(() => {
  const reference = slotNumber.value ?? freeSlots.value[0]?.number ?? 0
  return [...freeSlots.value]
    .sort((a, b) => Math.abs(a.number - reference) - Math.abs(b.number - reference))
    .slice(0, VISIBLE_FREE_SLOTS)
    .sort((a, b) => a.number - b.number)
})

function pickSlot(number: number): void {
  slotNumber.value = number
  slotSheetOpen.value = false
}

const slotTaken = computed(() => {
  const rack = activeRack.value
  if (!rack || slotNumber.value === null) return false
  return rack.slots.some((s) => s.number === slotNumber.value && s.bottle)
})

const nameMissing = computed(() => step.value === 'form' && !wine.value?.name?.trim())

/** Le nom manquant faisait échouer l'envoi côté serveur sans explication : on l'exige ici. */
const canSubmit = computed(
  () =>
    wine.value !== null &&
    Boolean(wine.value.name?.trim()) &&
    rackId.value !== '' &&
    slotNumber.value !== null &&
    !slotTaken.value,
)

function applyResult(result: ResolveResult): void {
  wine.value = result.wine as WineView | null
  candidates.value = result.candidates
  warning.value = result.warning
  if (result.wine) step.value = 'form'
  else error.value = 'Aucune information trouvée. Tu peux saisir la fiche à la main.'
}

async function onPhotoSelected(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  loading.value = true
  loadingLabel.value = 'Lecture de l’étiquette…'
  error.value = null
  warning.value = null

  try {
    const image = await prepareImage(file)
    previewUrl.value = image.previewUrl
    applyResult(
      await api.post<ResolveResult>('/api/wines/scan', {
        imageBase64: image.base64,
        mimeType: image.mimeType,
      }),
    )
  } catch (e) {
    const apiError = e as ApiError
    error.value = apiError.message
    if (apiError.status === 503 || apiError.status === 502) {
      warning.value = 'Utilise la recherche par nom ou la saisie manuelle ci-dessous.'
    }
  } finally {
    loading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function searchByName(): Promise<void> {
  if (manualQuery.value.trim().length < 2) return
  loading.value = true
  loadingLabel.value = 'Recherche…'
  error.value = null
  try {
    const data = await api.get<{ candidates: CandidateView[] }>(
      `/api/wines/search?q=${encodeURIComponent(manualQuery.value.trim())}`,
    )
    candidates.value = data.candidates
    if (data.candidates.length === 0) {
      error.value = 'Aucun résultat. Tu peux saisir la fiche à la main.'
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function pickCandidate(candidate: CandidateView): Promise<void> {
  loading.value = true
  loadingLabel.value = 'Récupération de la fiche…'
  try {
    const data = await api.get<{ wine: WineView }>(`/api/wines/vivino/${candidate.ref}`)
    wine.value = data.wine
    warning.value = null
    step.value = 'form'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function lookupBarcode(): Promise<void> {
  if (!/^\d{8,14}$/.test(barcode.value)) {
    error.value = 'Un code-barres comporte 8 à 14 chiffres.'
    return
  }
  loading.value = true
  loadingLabel.value = 'Recherche du code-barres…'
  error.value = null
  try {
    applyResult(await api.post<ResolveResult>('/api/wines/barcode', { barcode: barcode.value }))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function startManual(): void {
  wine.value = {
    id: '',
    name: '',
    producer: null,
    vintage: null,
    color: null,
    country: null,
    region: null,
    appellation: null,
    grapes: [],
    abv: null,
    description: null,
    producerUrl: null,
    imageUrl: null,
    vivinoUrl: null,
    vivinoRating: null,
    vivinoRatingCount: null,
    priceAvg: null,
    structure: { acidity: null, tannin: null, sweetness: null, intensity: null, fizziness: null },
    flavors: [],
    source: 'MANUAL',
    foodTags: [],
  }
  step.value = 'form'
}

async function submit(): Promise<void> {
  if (!canSubmit.value || !wine.value || loading.value) return

  loading.value = true
  loadingLabel.value = 'Rangement…'
  error.value = null
  fieldErrors.value = {}

  try {
    await api.post('/api/bottles', {
      wine: {
        name: wine.value.name.trim(),
        producer: wine.value.producer,
        vintage: numberOrNull(wine.value.vintage),
        color: wine.value.color,
        country: wine.value.country,
        region: wine.value.region,
        appellation: wine.value.appellation,
        grapes: wine.value.grapes,
        abv: numberOrNull(wine.value.abv),
        description: wine.value.description,
        producerUrl: wine.value.producerUrl,
        imageUrl: wine.value.imageUrl,
        vivinoUrl: wine.value.vivinoUrl,
        vivinoRating: numberOrNull(wine.value.vivinoRating),
        vivinoRatingCount: numberOrNull(wine.value.vivinoRatingCount),
        priceAvg: numberOrNull(wine.value.priceAvg),
        structure: wine.value.structure,
        flavors: wine.value.flavors,
        foodTags: wine.value.foodTags.map((f) => f.slug),
        source: wine.value.source,
      },
      rackId: rackId.value,
      slotNumber: numberOrNull(slotNumber.value),
      personalNote: personalNote.value.trim() || null,
      purchasePrice: numberOrNull(purchasePrice.value),
    })

    await cellar.loadRacks()
    router.push({ name: 'cellar' })
  } catch (e) {
    const apiError = e as ApiError
    error.value = apiError.message

    // On rattache chaque erreur de validation à son champ : un message générique
    // laissait l'utilisateur sans moyen de savoir quoi corriger.
    const issues = (apiError.payload as { issues?: { path: unknown[]; message: string }[] } | null)
      ?.issues
    if (issues) {
      const mapped: Record<string, string> = {}
      for (const issue of issues) mapped[issue.path.join('.')] = issue.message
      fieldErrors.value = mapped
    }
  } finally {
    loading.value = false
  }
}

const inputClass =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent'
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <h1 class="font-display text-2xl font-semibold text-text">Ajouter une bouteille</h1>

    <p v-if="loading" class="rounded-xl border border-line bg-surface p-6 text-center text-muted">
      {{ loadingLabel }}
    </p>

    <p v-if="error" role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-danger">
      {{ error }}
    </p>
    <p v-if="warning" class="rounded-xl bg-warning-soft px-4 py-3 text-warning">{{ warning }}</p>

    <!-- Étape 1 : identifier le vin -->
    <template v-if="step === 'choose'">
      <div class="space-y-3">
        <button
          type="button"
          class="flex w-full items-center gap-4 rounded-2xl border-2 border-accent bg-accent-soft p-5 text-left transition-colors hover:bg-surface-hover"
          @click="fileInput?.click()"
        >
          <CameraIcon class="h-10 w-10 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <span class="block text-lg font-semibold text-text">Photographier l'étiquette</span>
            <span class="block text-muted">
              Le plus rapide — les informations se remplissent toutes seules
            </span>
          </span>
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          @change="onPhotoSelected"
        />

        <div class="rounded-2xl border border-line bg-surface p-4">
          <label for="wine-query" class="mb-2 flex items-center gap-2 font-semibold text-text">
            <MagnifyingGlassIcon class="h-5 w-5 text-muted" aria-hidden="true" /> Chercher par nom
          </label>
          <div class="flex gap-2">
            <input
              id="wine-query"
              v-model="manualQuery"
              type="text"
              placeholder="Château Margaux 2015"
              :class="[inputClass, 'min-w-0']"
              @keydown.enter="searchByName"
            />
            <button
              type="button"
              class="shrink-0 rounded-xl bg-accent px-5 font-semibold text-accent-text"
              @click="searchByName"
            >
              Chercher
            </button>
          </div>
        </div>

        <div class="rounded-2xl border border-line bg-surface p-4">
          <label for="barcode" class="mb-2 flex items-center gap-2 font-semibold text-text">
            <TagIcon class="h-5 w-5 text-muted" aria-hidden="true" /> Code-barres
          </label>
          <div class="flex gap-2">
            <input
              id="barcode"
              v-model="barcode"
              type="text"
              inputmode="numeric"
              placeholder="3760040661234"
              :class="[inputClass, 'min-w-0']"
              @keydown.enter="lookupBarcode"
            />
            <button
              type="button"
              class="shrink-0 rounded-xl bg-accent px-5 font-semibold text-accent-text"
              @click="lookupBarcode"
            >
              Chercher
            </button>
          </div>
        </div>

        <button
          type="button"
          class="w-full rounded-xl border border-line p-3 text-muted transition-colors hover:bg-surface-hover"
          @click="startManual"
        >
          Saisir la fiche entièrement à la main
        </button>
      </div>

      <div v-if="candidates.length" class="space-y-2">
        <h2 class="font-semibold text-text">Est-ce l'un de ces vins ?</h2>
        <button
          v-for="candidate in candidates"
          :key="candidate.ref"
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent"
          @click="pickCandidate(candidate)"
        >
          <img
            v-if="candidate.imageUrl"
            :src="candidate.imageUrl"
            alt=""
            class="h-16 w-16 shrink-0 rounded object-contain"
            loading="lazy"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-text">{{ candidate.label }}</span>
            <span v-if="candidate.vintage" class="block text-sm text-muted">
              {{ candidate.vintage }}
            </span>
          </span>
        </button>
      </div>
    </template>

    <!-- Étape 2 : vérifier et ranger -->
    <template v-else-if="wine">
      <div class="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div class="flex flex-col gap-4 sm:flex-row">
          <img
            v-if="previewUrl || wine.imageUrl"
            :src="previewUrl ?? wine.imageUrl ?? ''"
            alt=""
            class="mx-auto h-28 w-24 shrink-0 rounded-xl object-contain sm:mx-0"
          />
          <div class="min-w-0 flex-1 space-y-3">
            <div>
              <label for="wine-name" class="mb-1.5 block text-sm font-medium text-muted">
                Nom du vin *
              </label>
              <input
                id="wine-name"
                v-model="wine.name"
                type="text"
                required
                :aria-invalid="nameMissing || Boolean(fieldErrors['wine.name'])"
                class="w-full rounded-xl border bg-surface px-4 py-3 text-text outline-none"
                :class="
                  nameMissing || fieldErrors['wine.name']
                    ? 'border-danger'
                    : 'border-line focus:border-accent'
                "
              />
              <p v-if="nameMissing" class="mt-1.5 text-sm text-danger">
                Le nom du vin est obligatoire.
              </p>
              <p v-else-if="fieldErrors['wine.name']" class="mt-1.5 text-sm text-danger">
                {{ fieldErrors['wine.name'] }}
              </p>
            </div>

            <div>
              <label for="wine-producer" class="mb-1.5 block text-sm font-medium text-muted">
                Domaine / château
              </label>
              <input id="wine-producer" v-model="wine.producer" type="text" :class="inputClass" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="wine-vintage" class="mb-1.5 block text-sm font-medium text-muted">
              Millésime
            </label>
            <input
              id="wine-vintage"
              v-model="wine.vintage"
              type="number"
              inputmode="numeric"
              min="1800"
              max="2100"
              placeholder="Laisse vide si non millésimé"
              :class="[inputClass, 'min-w-0']"
            />
            <p v-if="fieldErrors['wine.vintage']" class="mt-1.5 text-sm text-danger">
              {{ fieldErrors['wine.vintage'] }}
            </p>
          </div>

          <div>
            <label for="wine-color" class="mb-1.5 block text-sm font-medium text-muted">
              Couleur
            </label>
            <select id="wine-color" v-model="wine.color" :class="inputClass">
              <option :value="null">—</option>
              <option v-for="color in WINE_COLORS" :key="color" :value="color">
                {{ WINE_COLOR_LABELS[color] }}
              </option>
            </select>
          </div>

          <div>
            <label for="wine-region" class="mb-1.5 block text-sm font-medium text-muted">
              Région / appellation
            </label>
            <input id="wine-region" v-model="wine.region" type="text" :class="inputClass" />
          </div>

          <div>
            <label for="wine-price" class="mb-1.5 block text-sm font-medium text-muted">
              Prix d'achat (€)
            </label>
            <input
              id="wine-price"
              v-model="purchasePrice"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.5"
              placeholder="Facultatif"
              :class="[inputClass, 'min-w-0']"
            />
            <p v-if="fieldErrors['purchasePrice']" class="mt-1.5 text-sm text-danger">
              {{ fieldErrors['purchasePrice'] }}
            </p>
          </div>
        </div>

        <div
          v-if="wine.vivinoRating || wine.foodTags.length || wine.grapes.length"
          class="space-y-2 rounded-xl bg-surface-2 p-4"
        >
          <p v-if="wine.vivinoRating" class="text-sm">
            <span class="font-bold text-brass">★ {{ wine.vivinoRating.toFixed(1) }}/5</span>
            <span class="text-muted">
              sur {{ wine.vivinoRatingCount?.toLocaleString('fr-FR') }} avis Vivino
            </span>
          </p>
          <p v-if="wine.grapes.length" class="text-sm text-muted">
            Cépages : {{ wine.grapes.join(', ') }}
          </p>
          <div v-if="wine.foodTags.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="food in wine.foodTags"
              :key="food.slug"
              class="rounded-full bg-surface px-3 py-1 text-sm text-muted"
            >
              {{ food.emoji }} {{ food.labelFr }}
            </span>
          </div>
        </div>

        <div>
          <label for="wine-note" class="mb-1.5 block text-sm font-medium text-muted">
            Note personnelle
          </label>
          <textarea
            id="wine-note"
            v-model="personalNote"
            rows="2"
            placeholder="Offert par Jean, à ouvrir pour Noël…"
            :class="inputClass"
          />
        </div>
      </div>

      <!-- L'emplacement : le champ décisif -->
      <div class="space-y-4 rounded-2xl border-2 border-accent bg-surface p-4 sm:p-5">
        <p class="text-lg font-semibold text-text">Où la ranges-tu ? *</p>

        <div v-if="cellar.racks.length > 1">
          <label for="rack" class="mb-1.5 block text-sm font-medium text-muted">Casier</label>
          <select id="rack" v-model="rackId" :class="inputClass">
            <option v-for="rack in cellar.racks" :key="rack.id" :value="rack.id">
              {{ rack.name }}
            </option>
          </select>
        </div>

        <div>
          <label for="slot" class="mb-1.5 block text-sm font-medium text-muted">
            Numéro d'emplacement
            <span class="text-faint">({{ freeSlots.length }} libres)</span>
          </label>
          <input
            id="slot"
            v-model="slotNumber"
            type="number"
            inputmode="numeric"
            required
            class="w-full rounded-xl border bg-surface px-4 py-3 text-2xl font-bold text-text outline-none"
            :class="slotTaken ? 'border-danger' : 'border-line focus:border-accent'"
          />
          <p v-if="slotTaken" class="mt-1.5 text-sm text-danger">
            L'emplacement {{ slotNumber }} est déjà occupé.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="slot in visibleFreeSlots"
            :key="slot.id"
            type="button"
            class="h-11 min-w-12 rounded-lg border px-2 font-medium tabular-nums transition-colors"
            :class="
              slotNumber === slot.number
                ? 'border-accent bg-accent text-accent-text'
                : 'border-line text-muted hover:border-accent'
            "
            @click="slotNumber = slot.number"
          >
            {{ slot.number }}
          </button>
        </div>

        <button
          v-if="freeSlots.length > VISIBLE_FREE_SLOTS"
          type="button"
          class="min-h-11 w-full rounded-xl border border-line text-muted transition-colors hover:bg-surface-hover"
          @click="slotSheetOpen = true"
        >
          Voir les {{ freeSlots.length }} emplacements libres
        </button>

        <BottomSheet
          :open="slotSheetOpen"
          title="Choisir un emplacement"
          @close="slotSheetOpen = false"
        >
          <p class="mb-3 text-sm text-faint">
            {{ freeSlots.length }} emplacements libres dans « {{ activeRack?.name }} »
          </p>
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="slot in freeSlots"
              :key="slot.id"
              type="button"
              class="h-11 rounded-lg border px-1 font-medium tabular-nums transition-colors"
              :class="
                slotNumber === slot.number
                  ? 'border-accent bg-accent text-accent-text'
                  : 'border-line text-muted hover:border-accent'
              "
              @click="pickSlot(slot.number)"
            >
              {{ slot.number }}
            </button>
          </div>
        </BottomSheet>
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          class="rounded-xl border border-line px-5 py-3 font-medium text-muted"
          @click="step = 'choose'"
        >
          Retour
        </button>
        <button
          type="button"
          class="flex-1 rounded-xl bg-accent py-3.5 text-lg font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-40"
          :disabled="!canSubmit || loading"
          @click="submit"
        >
          Ranger dans la cave
        </button>
      </div>
    </template>
  </div>
</template>
