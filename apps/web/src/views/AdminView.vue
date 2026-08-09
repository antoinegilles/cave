<script setup lang="ts">
import { FEATURE_FLAGS } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api'
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
const rackDimensionsValid = computed(
  () =>
    Number.isInteger(rackRows.value) &&
    Number.isInteger(rackCols.value) &&
    rackRows.value >= 1 &&
    rackRows.value <= 30 &&
    rackCols.value >= 1 &&
    rackCols.value <= 30,
)
const rackSlotCount = computed(() =>
  rackDimensionsValid.value ? rackRows.value * rackCols.value : 0,
)
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

async function deleteRack(id: string, name: string): Promise<void> {
  if (!confirm(`Supprimer le casier « ${name} » ?`)) return
  error.value = null
  try {
    await api.delete(`/api/racks/${id}`)
    await cellar.loadRacks()
    flash('Casier supprimé.')
  } catch (e) {
    error.value = (e as Error).message
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

async function deleteUser(id: string, name: string): Promise<void> {
  if (!confirm(`Supprimer le compte de ${name} ?`)) return
  error.value = null
  try {
    await api.delete(`/api/admin/users/${id}`)
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function resetVivino(): Promise<void> {
  await api.post('/api/admin/vivino/reset')
  await refresh()
  flash('Circuit Vivino réarmé.')
}

async function clearCache(): Promise<void> {
  if (!confirm('Vider le cache des fiches ? Les prochains ajouts re-solliciteront Vivino.')) return
  const res = await api.delete<{ deleted: number }>('/api/admin/cache')
  await refresh()
  flash(`${res.deleted} entrée(s) supprimée(s).`)
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
      <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
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
        <button
          type="button"
          class="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          :class="flag.enabled ? 'bg-brass' : 'bg-surface-2'"
          @click="toggleFlag(flag)"
        >
          <span
            class="absolute top-1 h-5 w-5 rounded-full bg-bg transition-all"
            :class="flag.enabled ? 'left-6' : 'left-1'"
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
        class="flex items-center justify-between border-b border-line py-2 last:border-0"
      >
        <p class="text-text">
          {{ rack.name }}
          <span class="text-sm text-muted">
            — {{ rack.rows }} × {{ rack.cols }}, n° {{ rack.startNumber }} à
            {{ rack.startNumber + rack.rows * rack.cols - 1 }}
          </span>
        </p>
        <button
          type="button"
          class="text-sm text-faint hover:text-danger"
          @click="deleteRack(rack.id, rack.name)"
        >
          Supprimer
        </button>
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
            max="30"
            placeholder="Rangées"
            class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <input
            v-model.number="newRack.cols"
            type="number"
            min="1"
            max="30"
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
        <p v-if="newRack.name && !rackDimensionsValid" class="text-sm text-danger">
          Renseigne un nombre de rangées et de colonnes entre 1 et 30.
        </p>
      </div>
    </section>

    <!-- Comptes -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Comptes</h2>

      <div
        v-for="user in users"
        :key="user.id"
        class="flex items-center justify-between border-b border-line py-2 last:border-0"
      >
        <div>
          <p class="text-text">
            {{ user.name }}
            <span
              v-if="user.role === 'ADMIN'"
              class="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
            >
              admin
            </span>
          </p>
          <p class="text-xs text-faint">{{ user.email }}</p>
        </div>
        <button
          type="button"
          class="text-sm text-faint hover:text-danger"
          @click="deleteUser(user.id, user.name)"
        >
          Supprimer
        </button>
      </div>

      <div class="mt-4 space-y-3 rounded-lg bg-bg p-4">
        <p class="text-sm text-muted">Nouveau compte</p>
        <div class="grid grid-cols-2 gap-3">
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
  </div>
</template>
