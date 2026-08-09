<script setup lang="ts">
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
        <!-- Œil ouvert / barré, en SVG inline : aucune dépendance d'icônes. -->
        <svg
          v-if="!visible"
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg
          v-else
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.6 3.7" />
          <path d="M6.6 6.6A18.4 18.4 0 0 0 2 12s3.6 7 10 7a10.8 10.8 0 0 0 5.4-1.4" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          <path d="m2 2 20 20" />
        </svg>
      </button>
    </div>

    <p v-if="hint && !error" :id="`${id}-hint`" class="mt-1.5 text-sm text-faint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-sm text-danger">{{ error }}</p>
  </div>
</template>
