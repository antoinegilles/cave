<script setup lang="ts">
import { MAX_RACK_SIDE, MAX_RACK_SLOTS, MAX_SLOT_NUMBER } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import ConfirmSheet from '../components/ConfirmSheet.vue'
import { api } from '../lib/api'
import { rowLabel } from '../lib/rackLayout'
import type { RackView } from '../lib/types'
import { useCellarStore } from '../stores/cellar'
import { useNotificationsStore } from '../stores/notifications'

const cellar = useCellarStore()
const notifications = useNotificationsStore()
const error = ref<string | null>(null)
const busy = ref(false)

type RackDraft = Pick<RackView, 'name' | 'rows' | 'cols' | 'numbering' | 'startNumber'>
const drafts = ref<Record<string, RackDraft>>({})
const rowStarts = ref<Record<string, number[]>>({})
const newRack = ref<RackDraft>({
  name: '',
  rows: 6,
  cols: 10,
  numbering: 'ROW_MAJOR',
  startNumber: 1,
})

function syncDrafts(): void {
  drafts.value = Object.fromEntries(
    cellar.racks.map((rack) => [
      rack.id,
      {
        name: rack.name,
        rows: rack.rows,
        cols: rack.cols,
        numbering: rack.numbering,
        startNumber: rack.startNumber,
      },
    ]),
  )
  rowStarts.value = Object.fromEntries(
    cellar.racks.map((rack) => [
      rack.id,
      Array.from({ length: rack.rows }, (_, row) =>
        [...rack.slots].sort((a, b) => a.col - b.col).find((slot) => slot.row === row)?.number ?? 1,
      ),
    ]),
  )
}

onMounted(async () => {
  await cellar.loadRacks()
  syncDrafts()
})

function validDimensions(draft: RackDraft): boolean {
  return (
    Number.isInteger(draft.rows) &&
    Number.isInteger(draft.cols) &&
    draft.rows >= 1 &&
    draft.rows <= MAX_RACK_SIDE &&
    draft.cols >= 1 &&
    draft.cols <= MAX_RACK_SIDE &&
    draft.rows * draft.cols <= MAX_RACK_SLOTS
  )
}

const canCreate = computed(() => newRack.value.name.trim() && validDimensions(newRack.value))

async function reload(message: string): Promise<void> {
  await cellar.loadRacks()
  syncDrafts()
  notifications.show(message)
}

async function createRack(): Promise<void> {
  if (!canCreate.value) return
  busy.value = true
  error.value = null
  try {
    await api.post('/api/racks', { ...newRack.value, name: newRack.value.name.trim() })
    newRack.value = { name: '', rows: 6, cols: 10, numbering: 'ROW_MAJOR', startNumber: 1 }
    await reload('Casier créé.')
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}

async function saveRack(id: string): Promise<void> {
  const draft = drafts.value[id]
  if (!draft || !draft.name.trim() || !validDimensions(draft)) return
  busy.value = true
  error.value = null
  try {
    await api.patch(`/api/racks/${id}`, { ...draft, name: draft.name.trim() })
    await reload('Casier mis à jour.')
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}

async function renumber(id: string): Promise<void> {
  busy.value = true
  error.value = null
  try {
    await api.patch(`/api/racks/${id}/renumber`, { startNumbers: rowStarts.value[id] })
    await reload('Numérotation mise à jour.')
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}

const deleting = ref<RackView | null>(null)
async function deleteRack(): Promise<void> {
  if (!deleting.value) return
  busy.value = true
  error.value = null
  try {
    await api.delete(`/api/racks/${deleting.value.id}`)
    deleting.value = null
    await reload('Casier supprimé.')
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <div>
      <h1 class="font-display text-2xl font-semibold text-text">Réglages de ma cave</h1>
      <p class="mt-1 text-muted">Configure tes meubles et leurs numéros physiques.</p>
    </div>

    <p v-if="error" role="alert" class="rounded-xl bg-danger-soft p-3 text-danger">{{ error }}</p>

    <section
      v-for="rack in cellar.racks"
      :key="rack.id"
      class="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <template v-if="drafts[rack.id]">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-sm text-muted">Nom
            <input v-model="drafts[rack.id]!.name" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
          </label>
          <label class="text-sm text-muted">Numérotation
            <select v-model="drafts[rack.id]!.numbering" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text">
              <option value="ROW_MAJOR">Par rangée</option>
              <option value="COL_MAJOR">Par colonne</option>
            </select>
          </label>
          <label class="text-sm text-muted">Rangées
            <input v-model.number="drafts[rack.id]!.rows" type="number" min="1" :max="MAX_RACK_SIDE" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
          </label>
          <label class="text-sm text-muted">Colonnes
            <input v-model.number="drafts[rack.id]!.cols" type="number" min="1" :max="MAX_RACK_SIDE" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-text disabled:opacity-50" :disabled="busy || !validDimensions(drafts[rack.id]!)" @click="saveRack(rack.id)">Enregistrer</button>
          <button type="button" class="rounded-xl border border-danger px-4 py-2.5 text-danger" :disabled="busy" @click="deleting = rack">Supprimer</button>
        </div>

        <div class="border-t border-line pt-4">
          <h2 class="font-semibold text-text">Début de chaque rangée</h2>
          <p class="mb-3 text-sm text-muted">A est la rangée du bas. Les autres numéros sont recalculés automatiquement.</p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label v-for="(_, row) in rowStarts[rack.id]" :key="row" class="text-sm text-muted">
              Rangée {{ rowLabel(row) }}
              <input v-model.number="rowStarts[rack.id]![row]" type="number" min="0" :max="MAX_SLOT_NUMBER" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
            </label>
          </div>
          <button type="button" class="mt-3 rounded-xl border border-accent px-4 py-2.5 font-semibold text-accent" :disabled="busy" @click="renumber(rack.id)">Appliquer la numérotation</button>
        </div>
      </template>
    </section>

    <section class="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 class="font-semibold text-text">Nouveau casier</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <input v-model="newRack.name" placeholder="Nom" class="rounded-xl border border-line bg-bg p-3 text-text" />
        <select v-model="newRack.numbering" class="rounded-xl border border-line bg-bg p-3 text-text"><option value="ROW_MAJOR">Par rangée</option><option value="COL_MAJOR">Par colonne</option></select>
        <input v-model.number="newRack.rows" type="number" min="1" :max="MAX_RACK_SIDE" placeholder="Rangées" class="rounded-xl border border-line bg-bg p-3 text-text" />
        <input v-model.number="newRack.cols" type="number" min="1" :max="MAX_RACK_SIDE" placeholder="Colonnes" class="rounded-xl border border-line bg-bg p-3 text-text" />
      </div>
      <button type="button" class="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-text disabled:opacity-50" :disabled="busy || !canCreate" @click="createRack">Créer le casier</button>
    </section>

    <ConfirmSheet
      :open="deleting !== null"
      title="Supprimer ce casier ?"
      message="Le casier doit être vide. Cette action supprime ses emplacements."
      confirm-label="Supprimer"
      danger
      :busy="busy"
      @confirm="deleteRack"
      @cancel="deleting = null"
    />
  </div>
</template>
