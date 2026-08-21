<script setup lang="ts">
import { FEATURE_FLAGS } from '@cave/shared'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmSheet from '../components/ConfirmSheet.vue'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { useAuthStore } from '../stores/auth'

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
interface AnalyticsUserRow {
  id: string
  name: string
  email: string
  createdAt: string
  lastLoginAt: string | null
  logins: number
  activated: boolean
  bottles: number
}
interface AnalyticsRow {
  windowDays: number
  registration: {
    pageViews: number
    submitted: number
    success: number
    errors: Record<string, number>
  }
  activation: { newUsers: number; activatedUsers: number; totalUsers: number }
  add: { methods: Record<string, number>; bottlesAdded: number }
  search: { performed: number; sommelier: number }
  users: AnalyticsUserRow[]
}

const auth = useAuthStore()
const router = useRouter()

const users = ref<UserRow[]>([])
const flags = ref<FlagRow[]>([])
const status = ref<StatusRow | null>(null)
const analytics = ref<AnalyticsRow | null>(null)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

const newUser = ref({ name: '', email: '', password: '', role: 'USER' })

onMounted(refresh)

async function refresh(): Promise<void> {
  try {
    const [u, f, s, a] = await Promise.all([
      api.get<{ users: UserRow[] }>('/api/admin/users'),
      api.get<{ flags: FlagRow[] }>('/api/admin/flags'),
      api.get<StatusRow>('/api/admin/status'),
      api.get<AnalyticsRow>('/api/admin/analytics'),
    ])
    users.value = u.users
    flags.value = f.flags
    status.value = s
    analytics.value = a
  } catch (e) {
    error.value = (e as Error).message
  }
}

/** Formate un dictionnaire {clé: n} en « clé n · clé n », ou un tiret si vide. */
function summarizeTally(tally: Record<string, number>): string {
  const entries = Object.entries(tally)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key} ${value}`).join(' · ')
}

function shortDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'
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

async function viewCellar(user: UserRow): Promise<void> {
  await router.push({ name: 'cellar', query: { asUser: user.id } })
}

function deleteUser(id: string, name: string): void {
  confirming.value = {
    title: `Supprimer le compte de ${name} ?`,
    message:
      'Le compte, tous ses casiers, ses bouteilles et son historique seront supprimés définitivement.',
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

    <!-- Parcours (analytics maison, nominatif — comptes admin exclus) -->
    <section v-if="analytics" class="rounded-xl border border-line bg-surface p-5">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Parcours</h2>
        <span class="text-xs text-faint">{{ analytics.windowDays }} derniers jours · admins exclus</span>
      </div>

      <!-- Funnel d'inscription -->
      <div class="mb-4">
        <p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Inscription</p>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="rounded-lg bg-surface-2 px-2.5 py-1 text-muted">
            page vue <strong class="text-text">{{ analytics.registration.pageViews }}</strong>
          </span>
          <span aria-hidden="true" class="text-faint">→</span>
          <span class="rounded-lg bg-surface-2 px-2.5 py-1 text-muted">
            formulaire soumis <strong class="text-text">{{ analytics.registration.submitted }}</strong>
          </span>
          <span aria-hidden="true" class="text-faint">→</span>
          <span class="rounded-lg bg-accent-soft px-2.5 py-1 text-accent">
            compte créé <strong>{{ analytics.registration.success }}</strong>
          </span>
        </div>
        <p
          v-if="Object.keys(analytics.registration.errors).length"
          class="mt-1.5 text-xs text-muted"
        >
          Échecs : {{ summarizeTally(analytics.registration.errors) }}
        </p>
      </div>

      <!-- Activation, ajout, recherche -->
      <div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <p class="text-muted">
          Activés :
          <strong class="text-text">{{ analytics.activation.activatedUsers }}</strong> /
          {{ analytics.activation.totalUsers }}
          <span class="text-faint">(≥1 bouteille)</span>
        </p>
        <p class="text-muted">
          Voies d'ajout : <strong class="text-text">{{ summarizeTally(analytics.add.methods) }}</strong>
        </p>
        <p class="text-muted">
          Recherches : <strong class="text-text">{{ analytics.search.performed }}</strong>
          <span class="text-faint">· sommelier {{ analytics.search.sommelier }}</span>
        </p>
      </div>

      <!-- Table nominative : qui a fait quoi -->
      <div v-if="analytics.users.length" class="mt-4 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th class="py-1.5 pr-3 font-medium">Utilisateur</th>
              <th class="py-1.5 pr-3 font-medium">Inscrit</th>
              <th class="py-1.5 pr-3 font-medium">Vu</th>
              <th class="py-1.5 pr-3 font-medium">Conn.</th>
              <th class="py-1.5 pr-3 font-medium">Btl.</th>
              <th class="py-1.5 font-medium">Activé</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in analytics.users" :key="u.id" class="border-b border-line/60">
              <td class="py-1.5 pr-3">
                <span class="text-text">{{ u.name }}</span>
              </td>
              <td class="py-1.5 pr-3 text-muted">{{ shortDate(u.createdAt) }}</td>
              <td class="py-1.5 pr-3 text-muted">{{ shortDate(u.lastLoginAt) }}</td>
              <td class="py-1.5 pr-3 text-muted">{{ u.logins }}</td>
              <td class="py-1.5 pr-3 text-muted">{{ u.bottles }}</td>
              <td class="py-1.5">
                <span :class="u.activated ? 'text-success' : 'text-faint'">
                  {{ u.activated ? 'oui' : 'non' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
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
          v-if="user.id !== auth.user?.id"
          type="button"
          class="min-h-11 shrink-0 rounded-lg border border-accent px-3 text-sm font-medium text-accent hover:bg-accent-soft"
          @click="viewCellar(user)"
        >
          Consulter
        </button>
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
