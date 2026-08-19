<script setup lang="ts">
import { MAX_RACK_SLOTS, MAX_SLOT_NUMBER } from '@cave/shared'
import { computed, onMounted, ref } from 'vue'
import ConfirmSheet from '../components/ConfirmSheet.vue'
import { api } from '../lib/api'
import type { RackView } from '../lib/types'
import { useCellarStore } from '../stores/cellar'
import { useNotificationsStore } from '../stores/notifications'

const cellar = useCellarStore()
const notifications = useNotificationsStore()
const error = ref<string | null>(null)
const busy = ref(false)

/** Une cave se saisit désormais comme un intervalle : « de firstNumber à lastNumber ». */
interface RackDraft {
  name: string
  firstNumber: number
  lastNumber: number
}
const drafts = ref<Record<string, RackDraft>>({})
const newRack = ref<RackDraft>({ name: '', firstNumber: 1, lastNumber: 60 })

/** Un casier stocke ses emplacements, pas ses bornes : on les relit depuis les numéros. */
function boundsOf(rack: RackView): { firstNumber: number; lastNumber: number } {
  const numbers = rack.slots.map((slot) => slot.number)
  return { firstNumber: Math.min(...numbers), lastNumber: Math.max(...numbers) }
}

function syncDrafts(): void {
  drafts.value = Object.fromEntries(
    cellar.racks.map((rack) => [rack.id, { name: rack.name, ...boundsOf(rack) }]),
  )
}

onMounted(async () => {
  await cellar.loadRacks()
  syncDrafts()
})

/** Nombre d'emplacements d'un intervalle, ou null si l'intervalle est invalide. */
function slotCount(draft: RackDraft): number | null {
  const { firstNumber, lastNumber } = draft
  if (!Number.isInteger(firstNumber) || !Number.isInteger(lastNumber)) return null
  if (firstNumber < 0 || lastNumber < firstNumber) return null
  const count = lastNumber - firstNumber + 1
  return count <= MAX_RACK_SLOTS ? count : null
}

function isValid(draft: RackDraft): boolean {
  return Boolean(draft.name.trim()) && slotCount(draft) !== null
}

const newCount = computed(() => slotCount(newRack.value))
const canCreate = computed(() => isValid(newRack.value))

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
    newRack.value = { name: '', firstNumber: 1, lastNumber: 60 }
    await reload('Casier créé.')
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}

async function saveRack(id: string): Promise<void> {
  const draft = drafts.value[id]
  if (!draft || !isValid(draft)) return
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
      <p class="mt-1 text-muted">Décris chaque casier par l'intervalle de ses numéros physiques.</p>
    </div>

    <p v-if="error" role="alert" class="rounded-xl bg-danger-soft p-3 text-danger">{{ error }}</p>

    <section
      v-for="rack in cellar.racks"
      :key="rack.id"
      class="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <template v-if="drafts[rack.id]">
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="text-sm text-muted sm:col-span-3">Nom
            <input v-model="drafts[rack.id]!.name" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
          </label>
          <label class="text-sm text-muted">Du numéro
            <input v-model.number="drafts[rack.id]!.firstNumber" type="number" min="0" :max="MAX_SLOT_NUMBER" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
          </label>
          <label class="text-sm text-muted">Au numéro
            <input v-model.number="drafts[rack.id]!.lastNumber" type="number" min="0" :max="MAX_SLOT_NUMBER" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-text" />
          </label>
          <p class="self-end pb-3 text-sm text-muted">
            <template v-if="slotCount(drafts[rack.id]!) !== null">{{ slotCount(drafts[rack.id]!) }} emplacements</template>
            <template v-else>Intervalle invalide</template>
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-text disabled:opacity-50" :disabled="busy || !isValid(drafts[rack.id]!)" @click="saveRack(rack.id)">Enregistrer</button>
          <button type="button" class="rounded-xl border border-danger px-4 py-2.5 text-danger" :disabled="busy" @click="deleting = rack">Supprimer</button>
        </div>
      </template>
    </section>

    <section class="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 class="font-semibold text-text">Nouveau casier</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <input v-model="newRack.name" placeholder="Nom (ex. Salon)" class="rounded-xl border border-line bg-bg p-3 text-text sm:col-span-3" />
        <input v-model.number="newRack.firstNumber" type="number" min="0" :max="MAX_SLOT_NUMBER" placeholder="Du numéro" class="rounded-xl border border-line bg-bg p-3 text-text" />
        <input v-model.number="newRack.lastNumber" type="number" min="0" :max="MAX_SLOT_NUMBER" placeholder="Au numéro" class="rounded-xl border border-line bg-bg p-3 text-text" />
        <p class="self-center text-sm text-muted">
          <template v-if="newCount !== null">{{ newCount }} emplacements</template>
          <template v-else>Intervalle invalide</template>
        </p>
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
