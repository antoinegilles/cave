<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'
import { decimalFr } from '../lib/format'
import type { SlotView } from '../lib/types'

defineProps<{
  slot: SlotView | null
  rackName: string
  showRack: boolean
  readOnly?: boolean
}>()

defineEmits<{ close: []; open: [bottleId: string]; fill: [slotNumber: number] }>()
</script>

<template>
  <BottomSheet
    :open="slot !== null"
    :title="slot ? `Emplacement n° ${slot.number}` : ''"
    @close="$emit('close')"
  >
    <div v-if="slot" class="space-y-3">
      <p v-if="showRack" class="text-sm text-faint">Casier {{ rackName }}</p>

      <p v-if="slot.bottles.length === 0" class="text-muted">Cet emplacement est libre.</p>
      <ul v-else class="space-y-2" :aria-label="`${slot.bottles.length} bouteilles présentes`">
        <li
          v-for="bottle in slot.bottles"
          :key="bottle.id"
          class="rounded-xl border border-line bg-surface-2 p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-semibold text-text">{{ bottle.wine.name }}</p>
              <p class="truncate text-sm text-muted">
                {{ [bottle.wine.producer, bottle.wine.vintage].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <span v-if="bottle.wine.vivinoRating" class="shrink-0 text-sm font-bold text-brass">
              ★ {{ decimalFr(bottle.wine.vivinoRating) }}
            </span>
          </div>
          <button
            type="button"
            class="mt-2 min-h-11 w-full rounded-lg border border-line px-3 text-sm font-medium text-accent hover:bg-surface-hover"
            @click="$emit('open', bottle.id)"
          >
            Voir la fiche
          </button>
        </li>
      </ul>
    </div>

    <template v-if="slot && !readOnly" #actions>
      <button
        type="button"
        class="min-h-11 w-full rounded-xl bg-accent font-semibold text-accent-text transition-colors hover:bg-accent-hover"
        @click="$emit('fill', slot.number)"
      >
        {{ slot.bottles.length > 0 ? 'Ajouter une bouteille ici' : 'Ranger une bouteille ici' }}
      </button>
    </template>
  </BottomSheet>
</template>
