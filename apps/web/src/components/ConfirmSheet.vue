<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'

/**
 * Confirmation d'une action, en remplacement de `window.confirm()`.
 *
 * Le dialogue natif ne suit ni le thème ni la langue du reste de l'app, et sur téléphone
 * il s'affiche tout en haut de l'écran, loin du pouce.
 *
 * Le focus se pose sur le premier élément de la feuille — le bouton de fermeture, jamais
 * « Confirmer » : sur une action destructrice, une touche Entrée réflexe ne doit pas
 * suffire à supprimer. Le fond ne ferme pas non plus, d'où `dismiss-on-backdrop` à faux.
 */

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
  }>(),
  { confirmLabel: 'Confirmer', cancelLabel: 'Annuler', danger: false, busy: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

function cancel(): void {
  if (!props.busy) emit('cancel')
}
</script>

<template>
  <BottomSheet
    :open="open"
    :title="title"
    :dismiss-on-backdrop="false"
    @close="cancel"
  >
    <p v-if="message" class="text-muted">{{ message }}</p>

    <template #actions>
      <div class="flex gap-3">
        <button
          type="button"
          class="min-h-11 flex-1 rounded-xl border border-line px-5 font-medium text-muted transition-colors hover:bg-surface-hover"
          :disabled="busy"
          @click="cancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          class="min-h-11 flex-1 rounded-xl px-5 font-semibold text-accent-text transition-colors disabled:opacity-50"
          :class="danger ? 'bg-danger hover:opacity-90' : 'bg-accent hover:bg-accent-hover'"
          :disabled="busy"
          @click="$emit('confirm')"
        >
          {{ busy ? '…' : confirmLabel }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
