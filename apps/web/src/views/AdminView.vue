<script setup lang="ts">
import { FEATURE_FLAGS, MAX_RACK_SIDE, MAX_RACK_SLOTS } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import BottomSheet from '../components/BottomSheet.vue'
import ConfirmSheet from '../components/ConfirmSheet.vue'
import RackGrid from '../components/RackGrid.vue'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import type { SlotView } from '../lib/types'
import { useCellarStore } from '../stores/cellar'

interface UserRow {
  id: string
  email: string
  name: string
  role: string
  lastLoginAt: string | null
}
interface FlagRow {
  key: string
  enabled: boolean
}
interface StatusRow {
  counts: {
    users: number
    bottles: number
    wines: number
    cacheEntries: number
    aiQueriesLast7Days: number
  }
  vivino: { enabled: boolean; open: boolean; failures: number; retryAt: string | null }
  ai: { dailyQuotaPerUser: number; grounding: boolean }
}

const cellar = useCellarStore()

const users = ref<UserRow[]>([])
const flags = ref<FlagRow[]>([])
const status = ref<StatusRow | null>(null)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

const newRack = ref<{
  name: string
  rows: number | string
  cols: number | string
  numbering: string
  startNumber: number
}>({ name: '', rows: 6, cols: 10, numbering: 'ROW_MAJOR', startNumber: 1 })

/** Dimensions saisies, normalisées : un champ vidé renvoie '' et non un nombre. */
const rackRows = computed(() => Number(newRack.value.rows))
const rackCols = computed(() => Number(newRack.value.cols))
const rackSideValid = computed(
  () =>
    Number.isInteger(rackRows.value) &&
    Number.isInteger(rackCols.value) &&
    rackRows.value >= 1 &&
    rackRows.value <= MAX_RACK_SIDE &&
    rackCols.value >= 1 &&
    rackCols.value <= MAX_RACK_SIDE,
)
const rackSlotCount = computed(() => (rackSideValid.value ? rackRows.value * rackCols.value : 0))
const rackDimensionsValid = computed(
  () => rackSideValid.value && rackSlotCount.value <= MAX_RACK_SLOTS,
)
/** Message d'erreur de dimension, aligné sur les bornes du schéma partagé. */
const rackDimensionsError = computed(() => {
  if (rackDimensionsValid.value) return null
  if (!rackSideValid.value) {
    return `Renseigne un nombre de rangées et de colonnes entre 1 et ${MAX_RACK_SIDE}.`
  }
  return `Un casier ne peut pas dépasser ${MAX_RACK_SLOTS.toLocaleString('fr-FR')} emplacements.`
})
const newUser = ref({ name: '', email: '', password: '', role: 'USER' })

onMounted(refresh)

async function refresh(): Promise<void> {
  try {
    const [u, f, s] = await Promise.all([
      api.get<{ users: UserRow[] }>('/api/admin/users'),
      api.get<{ flags: FlagRow[] }>('/api/admin/flags'),
      api.get<StatusRow>('/api/admin/status'),
    ])
    users.value = u.users
    flags.value = f.flags
    status.value = s
    if (cellar.racks.length === 0) await cellar.loadRacks()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function flash(text: string): void {
  message.value = text
  setTimeout(() => (message.value = null), 4000)
}

async function toggleFlag(flag: FlagRow): Promise<void> {
  await api.patch(`/api/admin/flags/${flag.key}`, { enabled: !flag.enabled })
  flag.enabled = !flag.enabled
  flash(`Sommelier IA ${flag.enabled ? 'activé' : 'désactivé'}.`)
}

async function createRack(): Promise<void> {
  error.value = null
  try {
    await api.post('/api/racks', {
      ...newRack.value,
      rows: rackRows.value,
      cols: rackCols.value,
    })
    await cellar.loadRacks()
    newRack.value = { name: '', rows: 6, cols: 10, numbering: 'ROW_MAJOR', startNumber: 1 }
    flash('Casier créé.')
  } catch (e) {
    error.value = (e as Error).message
  }
}

/**
 * Confirmation en cours.
 *
 * Une seule feuille pour les trois actions irréversibles de la page : le libellé et
 * l'effet voyagent avec la demande, ce qui évite trois blocs de balisage quasi identiques.
 */
const confirming = ref<{
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  run: () => Promise<void>
} | null>(null)
const confirmBusy = ref(false)

async function runConfirmed(): Promise<void> {
  if (!confirming.value) return
  confirmBusy.value = true
  try {
    await confirming.value.run()
    confirming.value = null
  } catch (e) {
    error.value = (e as Error).message
    confirming.value = null
  } finally {
    confirmBusy.value = false
  }
}

/* ------------------------------------------------- numérotation des emplacements */

const NO_HIGHLIGHT = new Set<number>()
const renumberingRackId = ref<string | null>(null)
const renumberingRack = computed(
  () => cellar.racks.find((r) => r.id === renumberingRackId.value) ?? null,
)
const editingSlot = ref<SlotView | null>(null)
const editingNumber = ref<number | string>('')
const slotError = ref<string | null>(null)
const savingSlot = ref(false)

function editSlot(slot: SlotView): void {
  editingSlot.value = slot
  editingNumber.value = slot.number
  slotError.value = null
}

async function saveSlotNumber(): Promise<void> {
  const slot = editingSlot.value
  const rackId = renumberingRackId.value
  if (!slot || !rackId) return

  savingSlot.value = true
  slotError.value = null
  try {
    await api.patch(`/api/racks/${rackId}/slots/${slot.id}`, { number: editingNumber.value })
    await cellar.loadRacks()
    editingSlot.value = null
    flash('Numéro mis à jour.')
  } catch (e) {
    // Le 409 d'unicité s'affiche dans la feuille, au plus près du champ fautif.
    slotError.value = (e as Error).message
  } finally {
    savingSlot.value = false
  }
}

function deleteRack(id: string, name: string): void {
  confirming.value = {
    title: `Supprimer le casier « ${name} » ?`,
    message: 'Le casier et ses emplacements seront supprimés.',
    confirmLabel: 'Supprimer',
    danger: true,
    run: async () => {
      error.value = null
      await api.delete(`/api/racks/${id}`)
      await cellar.loadRacks()
      flash('Casier supprimé.')
    },
  }
}

async function createUser(): Promise<void> {
  error.value = null
  try {
    await api.post('/api/admin/users', newUser.value)
    newUser.value = { name: '', email: '', password: '', role: 'USER' }
    await refresh()
    flash('Compte créé.')
  } catch (e) {
    error.value = (e as Error).message
  }
}

function deleteUser(id: string, name: string): void {
  confirming.value = {
    title: `Supprimer le compte de ${name} ?`,
    message: 'Le compte sera supprimé définitivement.',
    confirmLabel: 'Supprimer',
    danger: true,
    run: async () => {
      error.value = null
      await api.delete(`/api/admin/users/${id}`)
      await refresh()
    },
  }
}

async function resetVivino(): Promise<void> {
  await api.post('/api/admin/vivino/reset')
  await refresh()
  flash('Circuit Vivino réarmé.')
}

function clearCache(): void {
  confirming.value = {
    title: 'Vider le cache des fiches ?',
    message: 'Les prochains ajouts re-solliciteront Vivino.',
    confirmLabel: 'Vider le cache',
    danger: false,
    run: async () => {
      const res = await api.delete<{ deleted: number }>('/api/admin/cache')
      await refresh()
      flash(plural(res.deleted, 'entrée supprimée', 'entrées supprimées') + '.')
    },
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="font-display text-2xl text-brass">Administration</h1>

    <p v-if="message" class="rounded-lg bg-success-soft px-4 py-2.5 text-sm text-success">
      {{ message }}
    </p>
    <p v-if="error" class="rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
      {{ error }}
    </p>

    <!-- État d'exploitation -->
    <section v-if="status" class="rounded-xl border border-line bg-surface p-5">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">État</h2>
      <div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <p class="text-muted">
          Bouteilles : <strong class="text-text">{{ status.counts.bottles }}</strong>
        </p>
        <p class="text-muted">
          Vins connus : <strong class="text-text">{{ status.counts.wines }}</strong>
        </p>
        <p class="text-muted">
          Cache : <strong class="text-text">{{ status.counts.cacheEntries }}</strong> fiches
        </p>
        <p class="text-muted">
          Requêtes IA (7 j) :
          <strong class="text-text">{{ status.counts.aiQueriesLast7Days }}</strong>
        </p>
        <p class="text-muted">
          Quota IA : <strong class="text-text">{{ status.ai.dailyQuotaPerUser }}/jour</strong>
        </p>
        <p class="text-muted">
          Vivino :
          <strong :class="status.vivino.open ? 'text-danger' : 'text-success'">
            {{ status.vivino.open ? 'bloqué' : status.vivino.enabled ? 'actif' : 'désactivé' }}
          </strong>
        </p>
      </div>

      <p v-if="status.vivino.open" class="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-brass">
        Le circuit est ouvert après {{ status.vivino.failures }} échecs — les fiches sont estimées
        depuis le cépage et la région. Reprise automatique
        {{ status.vivino.retryAt ? `le ${new Date(status.vivino.retryAt).toLocaleString('fr-FR')}` : '' }}.
      </p>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-accent"
          @click="resetVivino"
        >
          Réarmer Vivino
        </button>
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-accent"
          @click="clearCache"
        >
          Vider le cache
        </button>
      </div>
    </section>

    <!-- Feature flags -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Fonctionnalités
      </h2>
      <div
        v-for="flag in flags"
        :key="flag.key"
        class="flex items-center justify-between gap-4 py-2"
      >
        <div>
          <p class="text-text">
            {{ flag.key === FEATURE_FLAGS.AI_SOMMELIER ? 'Sommelier IA' : flag.key }}
          </p>
          <p class="text-xs text-faint">
            Coupé, le bouton disparaît de l'interface et l'API répond 404.
          </p>
        </div>
        <!-- Ce bouton n'avait ni texte, ni nom accessible, ni rôle : il était muet pour
             un lecteur d'écran. Sa piste faisait par ailleurs 30 px de haut. -->
        <button
          type="button"
          role="switch"
          :aria-checked="flag.enabled"
          :aria-label="flag.key === FEATURE_FLAGS.AI_SOMMELIER ? 'Sommelier IA' : flag.key"
          class="relative h-8 w-14 shrink-0 rounded-full transition-colors"
          :class="flag.enabled ? 'bg-brass' : 'bg-surface-2'"
          @click="toggleFlag(flag)"
        >
          <span
            class="absolute top-1 h-6 w-6 rounded-full bg-bg transition-all"
            :class="flag.enabled ? 'left-7' : 'left-1'"
          />
        </button>
      </div>
    </section>

    <!-- Casiers -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Casiers</h2>

      <div
        v-for="rack in cellar.racks"
        :key="rack.id"
        class="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-text">{{ rack.name }}</p>
          <p class="truncate text-xs text-faint">
            {{ rack.rows }} × {{ rack.cols }} — {{ rack.rows * rack.cols }} emplacements
          </p>
        </div>
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
          @click="renumberingRackId = renumberingRackId === rack.id ? null : rack.id"
        >
          {{ renumberingRackId === rack.id ? 'Terminer' : 'Numéroter' }}
        </button>
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm text-faint transition-colors hover:border-danger hover:text-danger"
          @click="deleteRack(rack.id, rack.name)"
        >
          Supprimer
        </button>
      </div>

      <!--
        Renumérotation au doigt : on touche l'alvéole telle qu'elle est sur le meuble et
        on saisit ce qui y est écrit. Les numéros n'ont pas à former une suite — une cave
        étiquetée 1, 2, 3, 100, 5, 6 est un cas réel.
      -->
      <div v-if="renumberingRack" class="mt-4 space-y-3 rounded-lg bg-bg p-4">
        <p class="text-sm text-muted">
          Touche un emplacement pour corriger son numéro, tel qu'il est inscrit sur le casier.
        </p>
        <RackGrid
          :rack="renumberingRack"
          :highlighted-numbers="NO_HIGHLIGHT"
          :search-active="false"
          @select-bottle="editSlot"
          @select-empty="editSlot"
        />
      </div>

      <div class="mt-4 space-y-3 rounded-lg bg-bg p-4">
        <p class="text-sm text-muted">Nouveau casier</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            v-model="newRack.name"
            placeholder="Nom"
            class="col-span-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent sm:col-span-1"
          />
          <input
            v-model.number="newRack.rows"
            type="number"
            min="1"
            :max="MAX_RACK_SIDE"
            placeholder="Rangées"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <input
            v-model.number="newRack.cols"
            type="number"
            min="1"
            :max="MAX_RACK_SIDE"
            placeholder="Colonnes"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <select
            v-model="newRack.numbering"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            <option value="ROW_MAJOR">Numéroté par rangée</option>
            <option value="COL_MAJOR">Numéroté par colonne</option>
          </select>
        </div>
        <p class="text-xs text-faint">
          La rangée A est celle du bas, comme devant ta cave. Les numéros doivent correspondre à
          ceux inscrits physiquement sur le casier.
        </p>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text disabled:opacity-40"
          :disabled="!newRack.name || !rackDimensionsValid"
          @click="createRack"
        >
          Créer<span v-if="rackDimensionsValid"> ({{ rackSlotCount }} emplacements)</span>
        </button>
        <p v-if="newRack.name && rackDimensionsError" class="text-sm text-danger">
          {{ rackDimensionsError }}
        </p>
      </div>
    </section>

    <!-- Comptes -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Comptes</h2>

      <div
        v-for="user in users"
        :key="user.id"
        class="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-text">
            {{ user.name }}
            <span
              v-if="user.role === 'ADMIN'"
              class="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
            >
              admin
            </span>
          </p>
          <p class="truncate text-xs text-faint">{{ user.email }}</p>
        </div>
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm text-faint transition-colors hover:border-danger hover:text-danger"
          @click="deleteUser(user.id, user.name)"
        >
          Supprimer
        </button>
      </div>

      <div class="mt-4 space-y-3 rounded-lg bg-bg p-4">
        <p class="text-sm text-muted">Nouveau compte</p>
        <!-- Seule grille du codebase sans repli mobile : quatre champs à 110 px de large. -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            v-model="newUser.name"
            placeholder="Prénom"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <input
            v-model="newUser.email"
            type="email"
            placeholder="Adresse e-mail"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <input
            v-model="newUser.password"
            type="text"
            placeholder="Mot de passe (10 caractères min.)"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <select
            v-model="newUser.role"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            <option value="USER">Utilisateur</option>
            <option value="ADMIN">Administrateur</option>
          </select>
        </div>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text disabled:opacity-40"
          :disabled="!newUser.name || !newUser.email || newUser.password.length < 10"
          @click="createUser"
        >
          Créer le compte
        </button>
      </div>
    </section>

    <BottomSheet
      :open="editingSlot !== null"
      title="Numéro de l'emplacement"
      @close="editingSlot = null"
    >
      <label for="slot-number" class="mb-1.5 block text-sm text-muted">
        Numéro inscrit sur le casier
      </label>
      <input
        id="slot-number"
        v-model="editingNumber"
        type="number"
        inputmode="numeric"
        min="0"
        class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-2xl font-bold text-text outline-none focus:border-accent"
      />
      <p v-if="slotError" class="mt-2 text-sm text-danger">{{ slotError }}</p>

      <template #actions>
        <button
          type="button"
          class="min-h-11 w-full rounded-xl bg-accent font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
          :disabled="savingSlot"
          @click="saveSlotNumber"
        >
          {{ savingSlot ? '…' : 'Enregistrer' }}
        </button>
      </template>
    </BottomSheet>

    <ConfirmSheet
      :open="confirming !== null"
      :title="confirming?.title ?? ''"
      :message="confirming?.message"
      :confirm-label="confirming?.confirmLabel"
      :danger="confirming?.danger ?? false"
      :busy="confirmBusy"
      @confirm="runConfirmed"
      @cancel="confirming = null"
    />
  </div>
</template>
