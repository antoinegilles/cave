<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  EllipsisVerticalIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/vue/24/outline'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useInstallApp } from '../lib/useInstallApp'
import { useAuthStore } from '../stores/auth'
import { useCellarStore } from '../stores/cellar'
import { usePrefsStore } from '../stores/prefs'
import { usePwaStore } from '../stores/pwa'

/**
 * Avatar + menu du compte (thème, installation, réglages, admin, déconnexion).
 *
 * Extrait de `App.vue` pour être réutilisable : la barre d'app le montre sur bureau, le hero
 * de « Ma cave » le montre sur téléphone (où la barre d'app est masquée). Composant autonome :
 * il gère son propre état d'ouverture, la navigation clavier et la fermeture au clic extérieur.
 */

const props = withDefaults(defineProps<{ align?: 'left' | 'right' }>(), { align: 'right' })

const auth = useAuthStore()
const cellar = useCellarStore()
const prefs = usePrefsStore()
const pwa = usePwaStore()
const route = useRoute()
const router = useRouter()
const { installApplication } = useInstallApp()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function items(): HTMLElement[] {
  return panelRef.value
    ? [...panelRef.value.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    : []
}

function close(restoreFocus = false): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) buttonRef.value?.focus()
}

async function toggle(): Promise<void> {
  if (open.value) {
    close(true)
    return
  }
  open.value = true
  await nextTick()
  items()[0]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const list = items()
  if (list.length === 0) return
  event.preventDefault()
  const current = Math.max(0, list.indexOf(document.activeElement as HTMLElement))
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? list.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1) % list.length
          : (current - 1 + list.length) % list.length
  list[index]?.focus()
}

function onDocumentClick(event: MouseEvent): void {
  if (open.value && rootRef.value && !rootRef.value.contains(event.target as Node)) {
    open.value = false
  }
}
function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close(true)
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})
watch(
  () => route.fullPath,
  () => close(),
)

async function onInstall(): Promise<void> {
  open.value = false
  await installApplication()
}

async function logout(): Promise<void> {
  open.value = false
  cellar.reset()
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div ref="rootRef" class="relative">
    <div class="flex items-center rounded-full border border-line bg-surface-2 p-0.5 shadow-card">
      <span
        class="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent"
        role="img"
        :aria-label="`Avatar de ${auth.user?.name}`"
      >
        {{ auth.user?.name?.charAt(0).toUpperCase() ?? '?' }}
      </span>
      <button
        ref="buttonRef"
        type="button"
        class="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
        :aria-expanded="open"
        aria-haspopup="menu"
        aria-controls="account-menu"
        aria-label="Ouvrir le menu du compte"
        @click="toggle"
      >
        <EllipsisVerticalIcon class="h-5 w-5" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="open"
      id="account-menu"
      ref="panelRef"
      class="absolute z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
      :class="props.align === 'left' ? 'left-0' : 'right-0'"
      role="menu"
      @keydown="onKeydown"
    >
      <div class="border-b border-line px-4 py-4">
        <p class="font-semibold text-text">{{ auth.user?.name }}</p>
        <p class="truncate text-sm text-muted">{{ auth.user?.email }}</p>
      </div>

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-3 px-4 py-3 text-left text-text transition-colors hover:bg-surface-hover"
        @click="prefs.toggleTheme"
      >
        <SunIcon v-if="prefs.theme === 'dark'" class="h-5 w-5 text-muted" aria-hidden="true" />
        <MoonIcon v-else class="h-5 w-5 text-muted" aria-hidden="true" />
        {{ prefs.theme === 'dark' ? 'Utiliser le thème clair' : 'Utiliser le thème sombre' }}
      </button>

      <button
        v-if="pwa.canInstall"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-3 px-4 py-3 text-left text-text transition-colors hover:bg-surface-hover"
        @click="onInstall"
      >
        <ArrowDownTrayIcon class="h-5 w-5 text-muted" aria-hidden="true" />
        Installer l'application
      </button>

      <RouterLink
        v-if="!cellar.isReadOnly"
        :to="{ name: 'rack-settings' }"
        role="menuitem"
        class="flex items-center gap-3 px-4 py-3 text-text transition-colors hover:bg-surface-hover"
        @click="open = false"
      >
        <Cog6ToothIcon class="h-5 w-5 text-muted" aria-hidden="true" /> Réglages de ma cave
      </RouterLink>

      <RouterLink
        v-if="auth.isAdmin"
        :to="{ name: 'admin' }"
        role="menuitem"
        class="flex items-center gap-3 px-4 py-3 text-text transition-colors hover:bg-surface-hover"
        @click="open = false"
      >
        <Cog6ToothIcon class="h-5 w-5 text-muted" aria-hidden="true" /> Administration
      </RouterLink>

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-3 px-4 py-3 text-left text-danger transition-colors hover:bg-surface-hover"
        @click="logout"
      >
        <ArrowRightStartOnRectangleIcon class="h-5 w-5" aria-hidden="true" /> Se déconnecter
      </button>
    </div>
  </div>
</template>
