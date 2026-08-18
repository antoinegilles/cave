<script setup lang="ts">
import { FOOD_TAGS, STRUCTURE_LABELS, WINE_COLOR_LABELS } from '@cave/shared'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FunnelIcon,
  LightBulbIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  Squares2X2Icon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, onMounted, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import SearchFilters from './SearchFilters.vue'
import { ApiError, api } from '../lib/api'
import { groupedBottleSlotAnswer, plural } from '../lib/format'
import { decideSearchMode } from '../lib/searchIntent'
import { resolveRecommendationSlots } from '../lib/sommelierSlots'
import { useHoverPointer } from '../lib/useMediaQuery'
import type { SommelierResult, SommelierStatus } from '../lib/types'
import { useCellarStore } from '../stores/cellar'
import { usePrefsStore } from '../stores/prefs'
import type { ListSort } from '../lib/bottleSort'

/**
 * Recherche unifiée.
 *
 * Un seul champ, deux moteurs, et surtout : l'utilisateur voit toujours lequel a répondu.
 *
 *  - La recherche SQL tourne à CHAQUE validation. Instantanée, gratuite, illimitée.
 *  - Le sommelier IA s'ajoute à toute validation d'au moins 3 caractères admissible —
 *    jamais pendant la frappe ou l'application d'un filtre. Voir `lib/searchIntent.ts`.
 *
 * Les résultats SQL restent affichés sous la réponse de l'IA : si celle-ci se trompe ou
 * échoue, l'utilisateur n'est jamais laissé devant un écran vide.
 */

const cellar = useCellarStore()
const prefs = usePrefsStore()
const hoverPointer = useHoverPointer()

const input = ref<HTMLInputElement | null>(null)
/** L'onglet « Chercher » de la barre basse amène ici et ouvre le clavier. */
defineExpose({ focus: () => input.value?.focus() })

const query = ref('')
const showFilters = ref(false)
const selectedColors = ref<string[]>([])
const selectedFoods = ref<string[]>([])
const minRating = ref<number | null>(null)
const structureBounds = ref<Record<string, [number, number]>>({})

const searching = ref(false)
const aiThinking = ref(false)
const aiResult = ref<SommelierResult | null>(null)
const aiError = ref<string | null>(null)
const sqlError = ref<string | null>(null)
const lastMode = ref<'sql' | 'ai' | null>(null)
let interactionId = 0

const SORTS: { key: ListSort; label: string }[] = [
  { key: 'slot', label: 'Emplacement' },
  { key: 'name', label: 'Nom' },
  { key: 'rating', label: 'Note' },
  { key: 'vintage', label: 'Millésime' },
]

const sommelier = ref<SommelierStatus | null>(null)
const sommelierStatusError = ref(false)
let sommelierStatusRequest: Promise<void> | null = null

/** Le compteur du bouton oubliait la note et le profil : « Filtres · 2 » pour 4 filtres. */
const activeFilterCount = computed(
  () =>
    selectedColors.value.length +
    selectedFoods.value.length +
    (minRating.value !== null ? 1 : 0) +
    Object.keys(structureBounds.value).length,
)

const hasFilters = computed(() => activeFilterCount.value > 0)

const quotaRemaining = computed(() => sommelier.value?.remaining ?? 0)

/** Ce que ferait une validation maintenant — sert à annoncer le mode à l'avance. */
const pendingDecision = computed(() =>
  decideSearchMode(query.value, {
    submitted: true,
    statusAvailable: sommelier.value !== null && !sommelierStatusError.value,
    featureEnabled: sommelier.value?.featureEnabled ?? false,
    configured: sommelier.value?.configured ?? false,
    quotaRemaining: quotaRemaining.value,
  }),
)

async function loadSommelierStatus(): Promise<void> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    sommelier.value = await api.get<SommelierStatus>('/api/ai/sommelier/status', controller.signal)
    sommelierStatusError.value = false
  } catch {
    // Le sommelier est un supplément : son indisponibilité ne casse rien.
    sommelier.value = null
    sommelierStatusError.value = true
  } finally {
    window.clearTimeout(timeout)
  }
}

onMounted(() => {
  sommelierStatusRequest = loadSommelierStatus()
})

function clearFilters(refresh = false): void {
  selectedColors.value = []
  selectedFoods.value = []
  minRating.value = null
  structureBounds.value = {}
  if (refresh) void refreshFromFilters()
}

/** Les facettes sont déjà appliquées ; l'action mobile ne fait que fermer la feuille. */
function applyFilters(): void {
  showFilters.value = false
}

function updateColors(value: string[]): void {
  selectedColors.value = value
  void refreshFromFilters()
}

function updateFoods(value: string[]): void {
  selectedFoods.value = value
  void refreshFromFilters()
}

function updateMinRating(value: number | null): void {
  minRating.value = value
  void refreshFromFilters()
}

function updateStructure(value: Record<string, [number, number]>): void {
  structureBounds.value = value
  void refreshFromFilters()
}

/** Une puce d'emplacement bascule sur le plan et l'y emmène. */
function goToSlot(rackId: string, number: number): void {
  prefs.viewMode = 'rack'
  cellar.focusSlot(rackId, number)
}

function searchLabel(prompt = query.value.trim()): string {
  return [
    prompt,
    ...selectedColors.value.map((c) => WINE_COLOR_LABELS[c as keyof typeof WINE_COLOR_LABELS]),
    ...selectedFoods.value.map((f) => FOOD_TAGS.find((t) => t.slug === f)?.labelFr ?? f),
    ...Object.keys(structureBounds.value).map(
      (axis) => STRUCTURE_LABELS[axis as keyof typeof STRUCTURE_LABELS] ?? axis,
    ),
    minRating.value !== null ? `Note ${minRating.value}+` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Recherche SQL — toujours exécutée, c'est le socle.
 *
 * Renvoie le drapeau du store : `false` seulement si une recherche plus récente a doublé
 * celle-ci. C'est ce qui autorise ensuite l'appel au sommelier.
 */
async function runSql(prompt = query.value.trim()): Promise<boolean> {
  const { applied } = await cellar.search(
    {
      q: prompt || undefined,
      colors: selectedColors.value.length ? selectedColors.value : undefined,
      foodTags: selectedFoods.value.length ? selectedFoods.value : undefined,
      minRating: minRating.value ?? undefined,
      structure: Object.keys(structureBounds.value).length ? structureBounds.value : undefined,
      status: 'IN_CELLAR',
    },
    searchLabel(prompt),
  )
  return applied
}

async function runAi(currentInteraction: number, submittedPrompt: string): Promise<void> {
  aiThinking.value = true
  aiError.value = null
  try {
    const result = await api.post<SommelierResult>(cellar.readPath('/api/ai/sommelier'), {
      // Capture faite au clic/Entrée : une modification pendant la réponse SQL ne peut pas
      // changer silencieusement la question réellement facturée au quota.
      prompt: submittedPrompt,
    })
    if (currentInteraction !== interactionId) return
    aiResult.value = result
    if (sommelier.value) sommelier.value.remaining = result.quotaRemaining

    // Le sommelier réutilise le mécanisme d'allumage de la recherche classique : un seul
    // chemin de rendu pour les deux moteurs. La résolution du casier est déléguée, car
    // le repli « sinon le casier actif » allumait le bon numéro sur le mauvais meuble.
    const keys = resolveRecommendationSlots(result.recommendations, cellar.racks)
    if (keys.length > 0) cellar.applyHighlight(keys, submittedPrompt)
  } catch (e) {
    if (currentInteraction !== interactionId) return
    const error = e as ApiError
    aiError.value = error.message
    if (error.status === 429 && sommelier.value) sommelier.value.remaining = 0
    if (error.status === 404 && sommelier.value) sommelier.value.featureEnabled = false
    if (error.status === 503 && sommelier.value) sommelier.value.configured = false
  } finally {
    if (currentInteraction === interactionId) aiThinking.value = false
  }
}

/**
 * Un clic de facette ne passe que par la recherche SQL. Le compteur monotone protège
 * aussi la réponse IA éventuellement encore en vol d'une validation précédente.
 */
async function refreshFromFilters(): Promise<void> {
  const currentInteraction = ++interactionId
  aiThinking.value = false
  aiResult.value = null
  aiError.value = null
  sqlError.value = null
  lastMode.value = 'sql'

  if (!query.value.trim() && !hasFilters.value) {
    cellar.clearSearch()
    searching.value = false
    lastMode.value = null
    return
  }

  searching.value = true
  try {
    await runSql()
  } catch (error) {
    if (currentInteraction === interactionId) sqlError.value = (error as Error).message
  } finally {
    if (currentInteraction === interactionId) searching.value = false
  }
}

/** Point d'entrée unique : déclenché par Entrée ou par le bouton, jamais à la frappe. */
async function submit(): Promise<void> {
  if (searching.value) return
  if (!query.value.trim() && !hasFilters.value) {
    reset()
    return
  }

  const currentInteraction = ++interactionId
  const submittedPrompt = query.value.trim()
  searching.value = true
  aiResult.value = null
  aiError.value = null
  sqlError.value = null

  try {
    // Le SQL part immédiatement. L'état IA peut finir de se charger en parallèle, mais
    // aucun appel Gemini ne démarre avant que la réponse classique ait été appliquée.
    const applied = await runSql(submittedPrompt)
    if (!sommelierStatusRequest || sommelierStatusError.value) {
      sommelierStatusRequest = loadSommelierStatus()
    }
    if (sommelierStatusRequest) await sommelierStatusRequest
    if (currentInteraction !== interactionId) return

    const decision = decideSearchMode(submittedPrompt, {
      submitted: true,
      statusAvailable: sommelier.value !== null && !sommelierStatusError.value,
      featureEnabled: sommelier.value?.featureEnabled ?? false,
      configured: sommelier.value?.configured ?? false,
      quotaRemaining: quotaRemaining.value,
    })
    lastMode.value = decision.mode
    if (applied && currentInteraction === interactionId && decision.mode === 'ai') {
      await runAi(currentInteraction, submittedPrompt)
    }
  } catch (error) {
    if (currentInteraction === interactionId) sqlError.value = (error as Error).message
  } finally {
    if (currentInteraction === interactionId) {
      searching.value = false
    }
  }
}

function reset(): void {
  interactionId += 1
  query.value = ''
  clearFilters()
  aiResult.value = null
  aiError.value = null
  sqlError.value = null
  lastMode.value = null
  cellar.clearSearch()
}

const total = computed(() => cellar.searchResult?.total ?? 0)
const uniqueWineTotal = computed(
  () => new Set((cellar.searchResult?.bottles ?? []).map((bottle) => bottle.wine.id)).size,
)

/** Ce que le lecteur d'écran énonce après une recherche. */
const announcement = computed(() =>
  groupedBottleSlotAnswer(
    uniqueWineTotal.value,
    total.value,
    cellar.searchLabel,
    cellar.matchedByRack.map((group) => ({
      rackName: group.rack.name,
      numbers: group.numbers,
    })),
    cellar.racks.length > 1,
  ),
)

function firstRecommendationSlot(
  recommendation: SommelierResult['recommendations'][number],
): number | string {
  return recommendation.locations.find((location) => location.slotNumber !== null)?.slotNumber ?? '–'
}

/** Ce que le sommelier est en train de faire, pendant que Gemini répond. */
const thinkingDetail = computed(() => {
  const total = cellar.totalBottles
  if (total === 0) return 'Il regarde ta cave…'
  return `Il passe en revue ${plural(total, 'bouteille')} pour te répondre.`
})

/** Ce que ferait une validation maintenant, en une ligne. */
const modeHint = computed(() => {
  if (sommelierStatusError.value) {
    return 'Recherche classique — état du sommelier indisponible'
  }
  if (!sommelier.value) return 'Vérification du sommelier en cours…'
  if (!sommelier.value.featureEnabled) return 'Recherche classique — sommelier désactivé'
  if (!sommelier.value.configured) return 'Recherche classique — clé Gemini absente'
  if (quotaRemaining.value <= 0) {
    return 'Le sommelier a fini sa journée — recherche classique jusqu’à demain'
  }
  if (!query.value.trim() || cellar.searchActive || searching.value) return null
  if (pendingDecision.value.mode === 'ai') {
    return `Le sommelier analysera ta cave — ${plural(quotaRemaining.value, 'conseil')} restant${quotaRemaining.value > 1 ? 's' : ''} aujourd'hui`
  }
  return 'Recherche classique — saisis au moins 3 caractères pour interroger aussi le sommelier'
})
</script>

<template>
  <section class="space-y-3">
    <div class="relative">
        <label for="cave-search" class="sr-only">Rechercher un vin</label>
        <input
          id="cave-search"
          ref="input"
          v-model="query"
          type="search"
          placeholder="Un plat, un domaine..."
          class="w-full rounded-2xl border border-line bg-surface py-3.5 pl-4 pr-14 text-text shadow-card outline-none focus:border-accent"
          @keydown.enter="submit"
        />
      <button
        type="button"
        class="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl bg-accent text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
        :disabled="searching"
        aria-label="Lancer la recherche"
        @click="submit"
      >
        <MagnifyingGlassIcon class="h-5 w-5" :class="searching ? 'motion-safe:animate-pulse' : ''" aria-hidden="true" />
      </button>
    </div>

    <!-- Ligne d'état : annonce le mode AVANT validation, et porte le quota sur téléphone. -->
    <p
      v-if="modeHint || sommelier"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-faint"
    >
      <span v-if="modeHint">{{ modeHint }}</span>
      <span
        v-if="sommelier?.featureEnabled && sommelier.configured"
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums"
        :class="
          quotaRemaining > 0
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line bg-surface-2 text-faint'
        "
      >
        <SparklesIcon class="h-4 w-4" aria-hidden="true" /> {{ quotaRemaining }}/{{ sommelier.dailyQuota }}
        <span class="sr-only">recherches sommelier restantes aujourd'hui</span>
      </span>
    </p>

    <!-- Organisation de la collection : une seule barre compacte, disponible à 320 px. -->
    <div class="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-card" aria-label="Organiser la collection">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium transition-colors"
        :class="showFilters || hasFilters ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-hover hover:text-text'"
        :aria-expanded="showFilters"
        @click="showFilters = !showFilters"
      >
        <FunnelIcon class="h-4 w-4" aria-hidden="true" />
        Filtres<span v-if="activeFilterCount" class="rounded-full bg-accent px-1.5 text-xs text-accent-text">{{ activeFilterCount }}</span>
      </button>

      <div class="h-6 w-px bg-line" aria-hidden="true" />

      <div class="flex min-w-0 flex-1 overflow-x-auto" aria-label="Trier les vins">
        <button
          v-for="option in SORTS"
          :key="option.key"
          type="button"
          class="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors sm:text-sm"
          :class="prefs.listSort === option.key ? 'text-accent' : 'text-muted hover:bg-surface-hover hover:text-text'"
          :aria-label="prefs.listSort === option.key ? `Trier par ${option.label}, ordre ${prefs.listSortDirection === 'asc' ? 'croissant' : 'décroissant'}` : `Trier par ${option.label}`"
          :aria-pressed="prefs.listSort === option.key"
          @click="prefs.selectSort(option.key)"
        >
          {{ option.label }}
          <ArrowUpIcon v-if="prefs.listSort === option.key && prefs.listSortDirection === 'asc'" class="h-3.5 w-3.5" aria-hidden="true" />
          <ArrowDownIcon v-else-if="prefs.listSort === option.key" class="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div class="flex rounded-xl bg-surface-2 p-0.5" role="group" aria-label="Mode d'affichage">
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          :class="prefs.viewMode === 'list' ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-text'"
          :aria-pressed="prefs.viewMode === 'list'"
          aria-label="Afficher la liste"
          @click="prefs.viewMode = 'list'"
        >
          <ListBulletIcon class="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          :class="prefs.viewMode === 'rack' ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-text'"
          :aria-pressed="prefs.viewMode === 'rack'"
          aria-label="Afficher le plan du casier"
          @click="prefs.viewMode = 'rack'"
        >
          <Squares2X2Icon class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p v-if="sqlError" role="alert" class="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
      {{ sqlError }}
    </p>

    <!--
      Le sommelier analyse. L'attente dure quelques secondes : on montre ce qu'il fait
      vraiment (il relit toute la cave) plutôt qu'un spinner muet.
    -->
    <div
      v-if="aiThinking"
      class="flex items-center gap-4 rounded-xl border border-accent bg-accent-soft px-4 py-3.5"
      role="status"
      aria-live="polite"
    >
      <span class="relative flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
        <span
          class="sommelier-ring absolute inset-0 rounded-full border-2 border-accent/25 border-t-accent"
        />
        <SparklesIcon class="h-5 w-5 text-accent" />
      </span>
      <span class="min-w-0">
        <span class="flex items-center gap-2 font-medium text-accent">
          Analyse du sommelier en cours
          <span class="flex gap-1">
            <span class="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
            <span class="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
            <span class="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </span>
        <span class="mt-0.5 block text-sm text-muted">{{ thinkingDetail }}</span>
      </span>
    </div>

    <!-- Réponse du sommelier -->
    <div
      v-else-if="aiResult"
      class="overflow-hidden rounded-xl border border-accent bg-surface"
    >
      <div class="flex items-center justify-between gap-2 bg-accent-soft px-4 py-2.5">
        <span class="flex items-center gap-2 font-semibold text-accent">
          <SparklesIcon class="h-5 w-5" aria-hidden="true" /> Réponse du sommelier
        </span>
        <span class="text-sm text-muted">
          {{
            aiResult.quotaRemaining > 0
              ? `encore ${plural(aiResult.quotaRemaining, 'conseil')} aujourd'hui`
              : 'dernier conseil du jour'
          }}
        </span>
      </div>

      <div class="space-y-3 p-4">
        <div
          v-for="rec in aiResult.recommendations"
          :key="rec.wineId"
          class="flex gap-3 rounded-xl border border-line bg-surface-2 p-3"
        >
          <RouterLink
            :to="{ name: 'bottle', params: { id: rec.representativeBottleId } }"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-lg font-bold text-accent-text"
            :aria-label="`Ouvrir la fiche ${rec.label}`"
          >
            {{ firstRecommendationSlot(rec) }}
          </RouterLink>
          <div class="min-w-0">
            <p class="font-semibold text-text">{{ rec.label }}</p>
            <p class="text-sm text-muted">{{ rec.reason }}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <template v-for="location in rec.locations" :key="location.bottleId">
                <button
                  v-if="location.rackId !== null && location.slotNumber !== null"
                  type="button"
                  class="min-h-9 rounded-lg border border-accent bg-accent-soft px-2.5 text-sm font-semibold text-accent"
                  :aria-label="`Aller à l'emplacement ${location.slotNumber}${location.rackName ? ` du casier ${location.rackName}` : ''}`"
                  @click="goToSlot(location.rackId, location.slotNumber)"
                >
                  {{ location.rackName ? `${location.rackName} · ` : '' }}{{ location.slotNumber }}
                </button>
                <span v-else class="rounded-lg border border-line px-2.5 py-1 text-sm text-faint">
                  Sans emplacement
                </span>
              </template>
            </div>
          </div>
        </div>

        <p v-if="aiResult.recommendations.length === 0" class="text-muted">
          Le sommelier n'a trouvé aucun vin vraiment adapté dans ta cave.
        </p>
        <p v-if="aiResult.note" class="flex gap-2 text-sm italic text-muted">
          <LightBulbIcon class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {{ aiResult.note }}
        </p>
      </div>
    </div>

    <!-- Échec de l'IA : la recherche classique a quand même répondu -->
    <div
      v-else-if="aiError"
      class="rounded-xl border border-warning bg-warning-soft px-4 py-3 text-sm"
    >
      <p class="flex items-center gap-2 font-medium text-warning">
        <SparklesIcon class="h-5 w-5" aria-hidden="true" /> Le sommelier n'a pas pu répondre
      </p>
      <p class="mt-0.5 text-muted">{{ aiError }}</p>
      <p class="mt-1 text-muted">Les résultats de la recherche classique restent affichés.</p>
    </div>

    <!--
      Le bandeau de résultats est LA réponse du produit : « 3 vins trouvés · emplacements
      12, 34, 51 », les numéros en grosses puces qui emmènent le plan sur l'alvéole.
      Auparavant la liste des emplacements était une mention grise en fin de phrase, et
      elle mélangeait sans le dire les numéros de plusieurs casiers.
    -->
    <div
      v-if="cellar.searchActive"
      class="space-y-3 rounded-xl border border-line bg-surface-2 px-4 py-3"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p class="sr-only">{{ announcement }}</p>

      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="flex flex-wrap items-center gap-1.5 text-text">
          <SparklesIcon v-if="lastMode === 'ai'" class="h-5 w-5 text-accent" aria-hidden="true" />
          <MagnifyingGlassIcon v-else class="h-5 w-5 text-accent" aria-hidden="true" />
          <strong class="font-display text-lg">{{ uniqueWineTotal }}</strong>
          {{ uniqueWineTotal > 1 ? 'vins trouvés' : 'vin trouvé' }}
          <span class="text-muted">· {{ plural(total, 'bouteille') }}</span>
          <span class="text-muted">pour « {{ cellar.searchLabel }} »</span>
        </p>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent hover:underline"
            @click="reset"
          >
            <XMarkIcon class="h-4 w-4" aria-hidden="true" /> Effacer
          </button>
        </div>
      </div>

      <div v-for="group in cellar.matchedByRack" :key="group.rack.id" class="space-y-1.5">
        <p class="text-sm text-muted">
          {{ cellar.racks.length > 1 ? `Casier ${group.rack.name}` : 'Emplacements' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="number in group.numbers"
            :key="number"
            type="button"
            class="min-h-11 min-w-11 rounded-xl border border-accent bg-accent-soft px-4 text-lg font-bold tabular-nums text-accent transition-colors hover:bg-accent hover:text-accent-text"
            :aria-label="`Aller à l'emplacement ${number} du casier ${group.rack.name} sur le plan`"
            @click="goToSlot(group.rack.id, number)"
          >
            {{ number }}
          </button>
        </div>
      </div>

      <p v-if="total === 0" class="text-sm text-muted">
        Aucun vin ne correspond. Essaie un mot plus simple : « poisson », « bordeaux »…
      </p>
    </div>

    <!-- Facettes : panneau en ligne à la souris, feuille au doigt. -->
    <div id="search-filters" v-if="hoverPointer && showFilters" class="rounded-xl border border-line bg-surface p-4 shadow-card">
      <SearchFilters
        :colors="selectedColors"
        :foods="selectedFoods"
        :min-rating="minRating"
        :structure="structureBounds"
        @update:colors="updateColors"
        @update:foods="updateFoods"
        @update:min-rating="updateMinRating"
        @update:structure="updateStructure"
      />
    </div>

    <BottomSheet
      v-if="!hoverPointer"
      :open="showFilters"
      title="Filtres"
      @close="showFilters = false"
    >
      <SearchFilters
        :colors="selectedColors"
        :foods="selectedFoods"
        :min-rating="minRating"
        :structure="structureBounds"
        @update:colors="updateColors"
        @update:foods="updateFoods"
        @update:min-rating="updateMinRating"
        @update:structure="updateStructure"
      />
      <template #actions>
        <div class="flex gap-3">
          <button
            type="button"
            class="min-h-11 rounded-xl border border-line px-5 font-medium text-muted transition-colors hover:bg-surface-hover"
            @click="clearFilters(true)"
          >
            Tout effacer
          </button>
          <button
            type="button"
            class="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-accent-text transition-colors hover:bg-accent-hover"
            @click="applyFilters"
          >
            Voir les résultats
          </button>
        </div>
      </template>
    </BottomSheet>
  </section>
</template>
