<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PasswordField from '../components/PasswordField.vue'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)
const registrationOpen = ref(false)

onMounted(async () => {
  try {
    // Le lien « Créer un compte » ne s'affiche que si le serveur accepte les inscriptions.
    const config = await api.get<{ registrationOpen: boolean }>('/api/auth/config')
    registrationOpen.value = config.registrationOpen
  } catch {
    registrationOpen.value = false
  }
})

async function submit(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    await auth.login(email.value.trim(), password.value)
    const redirect = route.query['redirect']
    router.push(typeof redirect === 'string' ? redirect : { name: 'cellar' })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80dvh] items-center justify-center">
    <form class="w-full max-w-sm space-y-6" @submit.prevent="submit">
      <div class="text-center">
        <p class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent font-display text-3xl font-bold text-accent-text shadow-float" aria-hidden="true">C</p>
        <h1 class="mt-3 font-display text-3xl font-semibold text-text">Cave</h1>
        <p class="mt-1 text-muted">Ta cave, emplacement par emplacement.</p>
      </div>

      <div class="space-y-4">
        <div>
          <label for="email" class="mb-1.5 block text-sm font-medium text-muted">
            Adresse e-mail
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
          />
        </div>

        <PasswordField
          id="password"
          v-model="password"
          label="Mot de passe"
          autocomplete="current-password"
          required
        />
      </div>

      <p v-if="error" role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-danger">
        {{ error }}
      </p>

      <button
        type="submit"
        class="w-full rounded-xl bg-accent py-3.5 text-lg font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
        :disabled="loading"
      >
        {{ loading ? 'Connexion…' : 'Se connecter' }}
      </button>

      <p v-if="registrationOpen" class="text-center text-muted">
        Pas encore de compte ?
        <RouterLink :to="{ name: 'register' }" class="font-semibold text-accent hover:underline">
          Créer un compte
        </RouterLink>
      </p>
    </form>
  </div>
</template>
