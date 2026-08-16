<script setup lang="ts">
import { computed } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { decimalFr } from '../lib/format'
import type { SlotView } from '../lib/types'

/**
 * Aperçu d'un emplacement, au doigt.
 *
 * Sur le plan du casier, toute la richesse d'un vin — domaine, millésime, note, région,
 * accords — était branchée sur le survol : elle n'existait donc pas sur téléphone, et un
 * appui quittait l'écran sans rien montrer. Cette feuille rend au doigt ce que la souris
 * obtenait déjà, avant de décider d'ouvrir la fiche.
 */

const props = defineProps<{
  slot: SlotView | null
  rackName: string
  /** Affiche le casier d'origine quand la cave en compte plusieurs. */
  showRack: boolean
}>()

defineEmits<{ close: []; open: [bottleId: string]; fill: [slotNumber: number] }>()

const wine = computed(() => props.slot?.bottle?.wine ?? null)

const title = computed(() => {
  if (!props.slot) return ''
  return wine.value ? wine.value.name : `Emplacement n° ${props.slot.number}`
})

const subtitle = computed(() => {
  if (!wine.value) return null
  return [wine.value.producer, wine.value.vintage].filter(Boolean).join(' · ') || null
})
</script>

<template>
  <BottomSheet :open="slot !== null" :title="title" @close="$emit('close')">
    <div v-if="slot" class="space-y-3">
      <p v-if="showRack" class="text-sm text-faint">
        Casier {{ rackName }} · emplacement n° {{ slot.number }}
      </p>

      <template v-if="wine">
        <div class="flex items-start justify-between gap-3">
          <p v-if="subtitle" class="min-w-0 text-muted">{{ subtitle }}</p>
          <span
            v-if="wine.vivinoRating"
            class="shrink-0 rounded-lg bg-surface-2 px-2 py-1 font-bold text-brass"
          >
            ★ {{ decimalFr(wine.vivinoRating) }}
          </span>
        </div>

        <p v-if="wine.region" class="text-sm text-faint">{{ wine.region }}</p>

        <div v-if="wine.foodTags.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="food in wine.foodTags"
            :key="food.slug"
            class="rounded-full bg-surface-2 px-2.5 py-1 text-sm text-muted"
          >
            {{ food.emoji }} {{ food.labelFr }}
          </span>
        </div>
      </template>

      <p v-else class="text-muted">Cet emplacement est libre.</p>
    </div>

    <template #actions>
      <button
        v-if="slot?.bottle"
        type="button"
        class="min-h-11 w-full rounded-xl bg-accent font-semibold text-accent-text transition-colors hover:bg-accent-hover"
        @click="$emit('open', slot.bottle.id)"
      >
        Voir la fiche
      </button>
      <button
        v-else-if="slot"
        type="button"
        class="min-h-11 w-full rounded-xl bg-accent font-semibold text-accent-text transition-colors hover:bg-accent-hover"
        @click="$emit('fill', slot.number)"
      >
        Ranger une bouteille ici
      </button>
    </template>
  </BottomSheet>
</template>
