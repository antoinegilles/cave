<script setup lang="ts">
import { FOOD_TAGS, STRUCTURE_LABELS, WINE_COLORS, WINE_COLOR_LABELS } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import { ApiError, api } from '../lib/api'
import { decideSearchMode } from '../lib/searchIntent'
import type { SommelierResult, SommelierStatus } from '../lib/types'
import { useCellarStore } from '../stores/cellar'

/**
 * Recherche unifiée.
 *
 * Un seul champ, deux moteurs, et surtout : l'utilisateur voit toujours lequel a répondu.
 *
 *  - La recherche SQL tourne à CHAQUE validation. Instantanée, gratuite, illimitée.
 *  - Le sommelier IA s'ajoute quand la phrase ressemble à une vraie question — jamais
 *    pendant la frappe, jamais sans quota. Voir `lib/searchIntent.ts`.
 *
 * Les résultats SQL restent affichés sous la réponse de l'IA : si celle-ci se trompe ou
 * échoue, l'utilisateur n'est jamais laissé devant un écran vide.
 */

const cellar = useCellarStore()

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
const lastMode = ref<'sql' | 'ai' | null>(null)
const forceSql = ref(false)

const sommelier = ref<SommelierStatus | null>(null)

const structureAxes = ['tannin', 'acidity', 'sweetness', 'intensity'] as const

const hasFilters = computed(
  () =>
    selectedColors.value.length > 0 ||
    selectedFoods.value.length > 0 ||
    minRating.value !== null ||
    Object.keys(structureBounds.value).length > 0,
)

const aiAvailable = computed(() => Boolean(sommelier.value?.enabled))
const quotaRemaining = computed(() => sommelier.value?.remaining ?? 0)

/** Ce que ferait une validation maintenant — sert à annoncer le mode à l'avance. */
const pendingDecision = computed(() =>
  decideSearchMode(query.value, {
    submitted: true,
    aiAvailable: aiAvailable.value,
    quotaRemaining: quotaRemaining.value,
    forceSql: forceSql.value,
  }),
)

onMounted(async () => {
  try {
    sommelier.value = await api.get<SommelierStatus>('/api/ai/sommelier/status')
  } catch {
    // Le sommelier est un supplément : son indisponibilité ne casse rien.
    sommelier.value = null
  }
})

function toggle(list: string[], item: string): void {
  const index = list.indexOf(item)
  if (index === -1) list.push(item)
  else list.splice(index, 1)
}

function toggleStructure(axis: string): void {
  if (structureBounds.value[axis]) {
    const next = { ...structureBounds.value }
    delete next[axis]
    structureBounds.value = next
  } else {
    // « Plutôt tannique » = moitié haute de l'échelle.
    structureBounds.value = { ...structureBounds.value, [axis]: [3, 5] }
  }
}

function searchLabel(): string {
  return (
    query.value.trim() ||
    [
      ...selectedColors.value.map((c) => WINE_COLOR_LABELS[c as keyof typeof WINE_COLOR_LABELS]),
      ...selectedFoods.value.map((f) => FOOD_TAGS.find((t) => t.slug === f)?.labelFr ?? f),
    ].join(', ')
  )
}

/** Recherche SQL — toujours exécutée, c'est le socle. */
async function runSql(): Promise<void> {
  await cellar.search(
    {
      q: query.value.trim() || undefined,
      colors: selectedColors.value.length ? selectedColors.value : undefined,
      foodTags: selectedFoods.value.length ? selectedFoods.value : undefined,
      minRating: minRating.value ?? undefined,
      structure: Object.keys(structureBounds.value).length ? structureBounds.value : undefined,
      status: 'IN_CELLAR',
    },
    searchLabel(),
  )
}

async function runAi(): Promise<void> {
  aiThinking.value = true
  aiError.value = null
  try {
    const result = await api.post<SommelierResult>('/api/ai/sommelier', {
      prompt: query.value.trim(),
    })
    aiResult.value = result
    if (sommelier.value) sommelier.value.remaining = result.quotaRemaining

    // Le sommelier réutilise le mécanisme d'allumage de la recherche classique :
    // un seul chemin de rendu pour les deux moteurs.
    const keys = result.recommendations
      .filter((r) => r.slotNumber !== null)
      .map((r) => {
        const rack = cellar.racks.find((rk) => rk.name === r.rackName) ?? cellar.activeRack
        return rack ? cellar.slotKey(rack.id, r.slotNumber!) : ''
      })
      .filter(Boolean)

    if (keys.length > 0) cellar.applyHighlight(keys, query.value.trim())
  } catch (e) {
    const error = e as ApiError
    aiError.value = error.message
    if (error.status === 429 && sommelier.value) sommelier.value.remaining = 0
  } finally {
    aiThinking.value = false
  }
}

/** Point d'entrée unique : déclenché par Entrée ou par le bouton, jamais à la frappe. */
async function submit(): Promise<void> {
  if (!query.value.trim() && !hasFilters.value) {
    reset()
    return
  }

  searching.value = true
  aiResult.value = null
  aiError.value = null

  const decision = decideSearchMode(query.value, {
    submitted: true,
    aiAvailable: aiAvailable.value,
    quotaRemaining: quotaRemaining.value,
    forceSql: forceSql.value,
  })
  lastMode.value = decision.mode

  try {
    // Le SQL part en premier et sans attendre l'IA : l'utilisateur a une réponse
    // affichée en quelques millisecondes, l'IA vient l'enrichir ensuite.
    await runSql()
    if (decision.mode === 'ai') await runAi()
  } finally {
    searching.value = false
    forceSql.value = false
  }
}

/** Rejoue la même phrase en recherche classique, sans consommer de crédit. */
async function retryWithoutAi(): Promise<void> {
  forceSql.value = true
  aiResult.value = null
  aiError.value = null
  await submit()
}

function reset(): void {
  query.value = ''
  selectedColors.value = []
  selectedFoods.value = []
  minRating.value = null
  structureBounds.value = {}
  aiResult.value = null
  aiError.value = null
  lastMode.value = null
  cellar.clearSearch()
}

const matchedSlotNumbers = computed(() =>
  [...cellar.highlightedSlots]
    .map((k) => Number(k.split(':')[1]))
    .sort((a, b) => a - b)
    .join(', '),
)
</script>

<template>
  <section class="space-y-3">
    <!-- Champ unique -->
    <div class="flex gap-2">
      <div class="relative flex-1">
        <label for="cave-search" class="sr-only">Rechercher un vin</label>
        <span
          class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg"
          aria-hidden="true"
        >
          {{ pendingDecision.mode === 'ai' ? '✨' : '🔍' }}
        </span>
        <input
          id="cave-search"
          v-model="query"
          type="search"
          placeholder="Un plat, un domaine, une région…"
          class="w-full rounded-xl border border-line bg-surface py-3.5 pl-12 text-text outline-none focus:border-accent"
          :class="sommelier?.enabled ? 'pr-24' : 'pr-4'"
          @keydown.enter="submit"
        />

        <!-- Compteur de recherches IA, dans le champ : rappelle en permanence que la
             fonctionnalité existe et combien de crédits il reste, sans occuper de place. -->
        <span
          v-if="sommelier?.enabled"
          class="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold tabular-nums"
          :class="
            quotaRemaining > 0
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line bg-surface-2 text-faint'
          "
          :title="
            quotaRemaining > 0
              ? `${quotaRemaining} recherche(s) sommelier IA disponible(s) aujourd'hui`
              : 'Quota du sommelier IA épuisé — la recherche classique reste illimitée'
          "
        >
          <span aria-hidden="true">✨</span>
          {{ quotaRemaining }}<span class="opacity-60">/{{ sommelier.dailyQuota }}</span>
          <span class="sr-only">
            recherches avec l'intelligence artificielle restantes aujourd'hui
          </span>
        </span>
      </div>

      <button
        type="button"
        class="rounded-xl border px-4 font-medium transition-colors"
        :class="
          showFilters || hasFilters
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line text-muted hover:bg-surface-hover'
        "
        :aria-expanded="showFilters"
        @click="showFilters = !showFilters"
      >
        Filtres<span v-if="hasFilters"> · {{ selectedColors.length + selectedFoods.length }}</span>
      </button>

      <button
        type="button"
        class="rounded-xl bg-accent px-6 font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
        :disabled="searching"
        @click="submit"
      >
        {{ searching ? '…' : 'Chercher' }}
      </button>
    </div>

    <!-- Annonce du mode AVANT validation : l'utilisateur sait ce qui va se passer -->
    <p v-if="query.trim() && !cellar.searchActive && !searching" class="px-1 text-sm text-faint">
      <template v-if="pendingDecision.mode === 'ai'">
        ✨ Cette question sera envoyée au sommelier
        <span class="text-muted">({{ quotaRemaining }} sur {{ sommelier?.dailyQuota }} restantes aujourd'hui)</span>
      </template>
      <template v-else-if="pendingDecision.reason === 'no-quota'">
        🔍 Recherche instantanée — quota du sommelier épuisé pour aujourd'hui
      </template>
      <template v-else> 🔍 Recherche instantanée dans ta cave </template>
    </p>

    <!-- Le sommelier réfléchit -->
    <div
      v-if="aiThinking"
      class="flex items-center gap-3 rounded-xl border border-accent bg-accent-soft px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <span class="text-xl" aria-hidden="true">✨</span>
      <span class="font-medium text-accent">Le sommelier réfléchit</span>
      <span class="flex gap-1" aria-hidden="true">
        <span class="thinking-dot h-2 w-2 rounded-full bg-accent" />
        <span class="thinking-dot h-2 w-2 rounded-full bg-accent" />
        <span class="thinking-dot h-2 w-2 rounded-full bg-accent" />
      </span>
    </div>

    <!-- Réponse du sommelier -->
    <div
      v-else-if="aiResult"
      class="overflow-hidden rounded-xl border border-accent bg-surface"
    >
      <div class="flex items-center justify-between gap-2 bg-accent-soft px-4 py-2.5">
        <span class="flex items-center gap-2 font-semibold text-accent">
          ✨ Réponse du sommelier
        </span>
        <span class="text-sm text-muted">
          {{ aiResult.quotaRemaining }} sur {{ sommelier?.dailyQuota }} restantes
        </span>
      </div>

      <div class="space-y-3 p-4">
        <div
          v-for="rec in aiResult.recommendations"
          :key="rec.bottleId"
          class="flex gap-3 rounded-xl border border-line bg-surface-2 p-3"
        >
          <RouterLink
            :to="{ name: 'bottle', params: { id: rec.bottleId } }"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-lg font-bold text-accent-text"
          >
            {{ rec.slotNumber ?? '–' }}
          </RouterLink>
          <div class="min-w-0">
            <p class="font-semibold text-text">{{ rec.label }}</p>
            <p class="text-sm text-muted">{{ rec.reason }}</p>
          </div>
        </div>

        <p v-if="aiResult.recommendations.length === 0" class="text-muted">
          Le sommelier n'a trouvé aucun vin vraiment adapté dans ta cave.
        </p>
        <p v-if="aiResult.note" class="text-sm italic text-muted">💡 {{ aiResult.note }}</p>
      </div>
    </div>

    <!-- Échec de l'IA : la recherche classique a quand même répondu -->
    <div
      v-else-if="aiError"
      class="rounded-xl border border-warning bg-warning-soft px-4 py-3 text-sm"
    >
      <p class="font-medium text-warning">✨ Le sommelier n'a pas pu répondre</p>
      <p class="mt-0.5 text-muted">{{ aiError }}</p>
      <p class="mt-1 text-muted">Les résultats de la recherche classique restent affichés.</p>
    </div>

    <!-- Bandeau de résultats SQL — toujours présent -->
    <div
      v-if="cellar.searchActive"
      class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3"
    >
      <p class="text-sm text-text">
        <span aria-hidden="true">{{ lastMode === 'ai' ? '📋' : '🔍' }}</span>
        <strong>{{ cellar.searchResult?.total ?? 0 }}</strong>
        vin(s) pour « {{ cellar.searchLabel }} »
        <span v-if="matchedSlotNumbers" class="text-muted">
          → emplacements {{ matchedSlotNumbers }}
        </span>
      </p>

      <div class="flex items-center gap-3">
        <button
          v-if="lastMode === 'ai'"
          type="button"
          class="text-sm text-muted underline decoration-dotted hover:text-text"
          @click="retryWithoutAi"
        >
          Chercher sans l'IA
        </button>
        <button
          type="button"
          class="text-sm font-medium text-accent hover:underline"
          @click="reset"
        >
          Effacer
        </button>
      </div>
    </div>

    <!-- Facettes -->
    <div v-if="showFilters" class="space-y-5 rounded-xl border border-line bg-surface p-4">
      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-muted">Couleur</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="color in WINE_COLORS"
            :key="color"
            type="button"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="
              selectedColors.includes(color)
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line text-muted hover:bg-surface-hover'
            "
            :aria-pressed="selectedColors.includes(color)"
            @click="toggle(selectedColors, color)"
          >
            {{ WINE_COLOR_LABELS[color] }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-muted">Accord mets-vins</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in FOOD_TAGS"
            :key="tag.slug"
            type="button"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="
              selectedFoods.includes(tag.slug)
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line text-muted hover:bg-surface-hover'
            "
            :aria-pressed="selectedFoods.includes(tag.slug)"
            @click="toggle(selectedFoods, tag.slug)"
          >
            {{ tag.emoji }} {{ tag.labelFr }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-muted">Profil marqué</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="axis in structureAxes"
            :key="axis"
            type="button"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="
              structureBounds[axis]
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line text-muted hover:bg-surface-hover'
            "
            :aria-pressed="Boolean(structureBounds[axis])"
            @click="toggleStructure(axis)"
          >
            {{ STRUCTURE_LABELS[axis] }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-muted">Note Vivino minimale</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="value in [3, 3.5, 4, 4.5]"
            :key="value"
            type="button"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="
              minRating === value
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line text-muted hover:bg-surface-hover'
            "
            :aria-pressed="minRating === value"
            @click="minRating = minRating === value ? null : value"
          >
            ★ {{ value }}+
          </button>
        </div>
      </fieldset>
    </div>
  </section>
</template>
