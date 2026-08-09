<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PasswordField from '../components/PasswordField.vue'
import { ApiError, api, setAccessToken } from '../lib/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const inviteCode = ref('')
const error = ref<string | null>(null)
const loading = ref(false)
const requiresInviteCode = ref(false)
const registrationOpen = ref(true)

onMounted(async () => {
  try {
    const config = await api.get<{ registrationOpen: boolean; requiresInviteCode: boolean }>(
      '/api/auth/config',
    )
    registrationOpen.value = config.registrationOpen
    requiresInviteCode.value = config.requiresInviteCode
    if (!config.registrationOpen) router.replace({ name: 'login' })
  } catch {
    // En cas d'échec, on laisse tenter : le serveur reste l'autorité.
  }
})

const passwordTooShort = computed(
  () => password.value.length > 0 && password.value.length < 10,
)

const canSubmit = computed(
  () =>
    name.value.trim().length > 0 &&
    email.value.trim().length > 0 &&
    password.value.length >= 10 &&
    (!requiresInviteCode.value || inviteCode.value.trim().length > 0),
)

async function submit(): Promise<void> {
  if (!canSubmit.value || loading.value) return
  loading.value = true
  error.value = null

  try {
    const data = await api.post<{ accessToken: string; user: typeof auth.user }>(
      '/api/auth/register',
      {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        ...(requiresInviteCode.value ? { inviteCode: inviteCode.value.trim() } : {}),
      },
    )

    // Le serveur ouvre déjà la session : on enchaîne directement sur la cave plutôt
    // que de renvoyer vers l'écran de connexion.
    setAccessToken(data.accessToken)
    auth.user = data.user
    router.push({ name: 'cellar' })
  } catch (e) {
    error.value = (e as ApiError).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80dvh] items-center justify-center">
    <form class="w-full max-w-sm space-y-6" @submit.prevent="submit">
      <div class="text-center">
        <p class="text-6xl" aria-hidden="true">🍷</p>
        <h1 class="mt-3 font-display text-3xl font-semibold text-text">Créer un compte</h1>
        <p class="mt-1 text-muted">Pour gérer ta cave et retrouver tes bouteilles.</p>
      </div>

      <div class="space-y-4">
        <div>
          <label for="name" class="mb-1.5 block text-sm font-medium text-muted">Prénom *</label>
          <input
            id="name"
            v-model="name"
            type="text"
            autocomplete="given-name"
            required
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
          />
        </div>

        <div>
          <label for="reg-email" class="mb-1.5 block text-sm font-medium text-muted">
            Adresse e-mail *
          </label>
          <input
            id="reg-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
          />
        </div>

        <PasswordField
          id="reg-password"
          v-model="password"
          label="Mot de passe"
          autocomplete="new-password"
          hint="10 caractères minimum."
          :error="passwordTooShort ? 'Encore un peu court : 10 caractères minimum.' : null"
          required
        />

        <div v-if="requiresInviteCode">
          <label for="invite" class="mb-1.5 block text-sm font-medium text-muted">
            Code d'invitation *
          </label>
          <input
            id="invite"
            v-model="inviteCode"
            type="text"
            required
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-text outline-none focus:border-accent"
          />
        </div>
      </div>

      <p v-if="error" role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-danger">
        {{ error }}
      </p>

      <button
        type="submit"
        class="w-full rounded-xl bg-accent py-3.5 text-lg font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
        :disabled="!canSubmit || loading"
      >
        {{ loading ? 'Création…' : 'Créer mon compte' }}
      </button>

      <p class="text-center text-muted">
        Déjà un compte ?
        <RouterLink :to="{ name: 'login' }" class="font-semibold text-accent hover:underline">
          Se connecter
        </RouterLink>
      </p>
    </form>
  </div>
</template>
