<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'

/**
 * Champ mot de passe avec bouton œil.
 *
 * Sur un téléphone, saisir un mot de passe long à l'aveugle est la première cause
 * d'abandon — d'autant plus pour le public visé. Le bouton est une vraie cible de 44 px
 * et annonce son état aux lecteurs d'écran via `aria-pressed`.
 */

const props = withDefaults(
  defineProps<{
    modelValue: string
    id: string
    label: string
    autocomplete?: string
    placeholder?: string
    hint?: string
    error?: string | null
    required?: boolean
  }>(),
  { autocomplete: 'current-password', placeholder: '', hint: '', error: null, required: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const visible = ref(false)
const describedBy = computed(() =>
  [props.error ? `${props.id}-error` : null, props.hint ? `${props.id}-hint` : null]
    .filter(Boolean)
    .join(' ') || undefined,
)
</script>

<template>
  <div>
    <label :for="id" class="mb-1.5 block text-sm font-medium text-muted">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>

    <div class="relative">
      <input
        :id="id"
        :value="modelValue"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="w-full rounded-xl border bg-surface py-3 pl-4 pr-14 text-text outline-none"
        :class="error ? 'border-danger' : 'border-line focus:border-accent'"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />

      <button
        type="button"
        class="absolute right-1 top-1/2 flex h-11 w-12 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-text"
        :aria-label="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
        :aria-pressed="visible"
        :aria-controls="id"
        @click="visible = !visible"
      >
        <EyeIcon v-if="!visible" class="h-5 w-5" aria-hidden="true" />
        <EyeSlashIcon v-else class="h-5 w-5" aria-hidden="true" />
      </button>
    </div>

    <p v-if="hint && !error" :id="`${id}-hint`" class="mt-1.5 text-sm text-faint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-sm text-danger">{{ error }}</p>
  </div>
</template>
