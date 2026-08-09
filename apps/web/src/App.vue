<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { usePrefsStore } from './stores/prefs'
import { useAuthStore } from './stores/auth'

/**
 * Coque de l'application.
 *
 * Deux principes issus des retours d'usage :
 *  - « Ajouter une bouteille » est L'action principale, pas un lien parmi d'autres :
 *    bouton plein sur bureau, bouton central surélevé sur téléphone.
 *  - « Admin » quitte la navigation principale pour le menu compte : c'est une page de
 *    réglages, pas une destination quotidienne. La barre reste ainsi lisible.
 */

const auth = useAuthStore()
const prefs = usePrefsStore()
const route = useRoute()
const router = useRouter()

const showChrome = computed(() => auth.isAuthenticated && !route.meta['public'])

const mainNav = [
  { name: 'cellar', label: 'Ma cave', icon: '🍷' },
  { name: 'history', label: 'Historique', icon: '📖' },
  { name: 'stats', label: 'Statistiques', icon: '📊' },
]

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function onDocumentClick(event: MouseEvent): void {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(event.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

async function logout(): Promise<void> {
  menuOpen.value = false
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-dvh bg-bg">
    <a
      href="#contenu"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-text"
    >
      Aller au contenu
    </a>

    <header v-if="showChrome" class="sticky top-0 z-30 border-b border-line bg-surface">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <RouterLink :to="{ name: 'cellar' }" class="flex shrink-0 items-center gap-2">
          <span class="text-2xl" aria-hidden="true">🍷</span>
          <span class="font-display text-xl font-semibold text-text">Cave</span>
        </RouterLink>

        <nav class="ml-4 hidden gap-1 sm:flex" aria-label="Navigation principale">
          <RouterLink
            v-for="item in mainNav"
            :key="item.name"
            :to="{ name: item.name }"
            class="flex items-center rounded-lg px-3 py-2 font-medium transition-colors"
            :class="
              route.name === item.name
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-surface-hover hover:text-text'
            "
          >
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <!-- Action principale, toujours visible sur bureau -->
          <RouterLink
            :to="{ name: 'add' }"
            class="hidden items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-text transition-colors hover:bg-accent-hover sm:flex"
          >
            <span aria-hidden="true">＋</span> Ajouter une bouteille
          </RouterLink>

          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-muted transition-colors hover:bg-surface-hover"
            :aria-label="
              prefs.theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'
            "
            @click="prefs.toggleTheme"
          >
            {{ prefs.theme === 'dark' ? '☀️' : '🌙' }}
          </button>

          <div ref="menuRef" class="relative">
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2 font-semibold text-text transition-colors hover:bg-surface-hover"
              :aria-expanded="menuOpen"
              aria-haspopup="menu"
              :aria-label="`Compte de ${auth.user?.name}`"
              @click="menuOpen = !menuOpen"
            >
              {{ auth.user?.name?.charAt(0).toUpperCase() ?? '?' }}
            </button>

            <div
              v-if="menuOpen"
              class="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-float"
              role="menu"
            >
              <div class="border-b border-line px-4 py-3">
                <p class="font-semibold text-text">{{ auth.user?.name }}</p>
                <p class="truncate text-sm text-muted">{{ auth.user?.email }}</p>
              </div>

              <RouterLink
                v-if="auth.isAdmin"
                :to="{ name: 'admin' }"
                role="menuitem"
                class="flex items-center gap-3 px-4 py-3 text-text transition-colors hover:bg-surface-hover"
                @click="menuOpen = false"
              >
                <span aria-hidden="true">⚙️</span> Administration
              </RouterLink>

              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-3 px-4 py-3 text-left text-danger transition-colors hover:bg-surface-hover"
                @click="logout"
              >
                <span aria-hidden="true">↩</span> Se déconnecter
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main id="contenu" class="mx-auto max-w-5xl px-4 py-6" :class="showChrome ? 'pb-28 sm:pb-10' : ''">
      <RouterView />
    </main>

    <!-- Barre basse : l'app se manipule debout devant la cave, le pouce en bas de l'écran. -->
    <nav
      v-if="showChrome"
      class="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Navigation"
    >
      <div class="flex items-end justify-around px-2">
        <RouterLink
          v-for="item in mainNav.slice(0, 1)"
          :key="item.name"
          :to="{ name: item.name }"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
          :class="route.name === item.name ? 'text-accent' : 'text-muted'"
        >
          <span class="text-xl" aria-hidden="true">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>

        <RouterLink
          :to="{ name: 'history' }"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
          :class="route.name === 'history' ? 'text-accent' : 'text-muted'"
        >
          <span class="text-xl" aria-hidden="true">📖</span>
          Historique
        </RouterLink>

        <!-- Bouton central surélevé : impossible à manquer -->
        <RouterLink
          :to="{ name: 'add' }"
          class="-mt-5 flex flex-col items-center px-2"
          aria-label="Ajouter une bouteille"
        >
          <span
            class="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl text-accent-text shadow-float"
            aria-hidden="true"
          >
            ＋
          </span>
          <span class="mt-0.5 text-xs font-medium text-accent">Ajouter</span>
        </RouterLink>

        <RouterLink
          :to="{ name: 'stats' }"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
          :class="route.name === 'stats' ? 'text-accent' : 'text-muted'"
        >
          <span class="text-xl" aria-hidden="true">📊</span>
          Stats
        </RouterLink>

        <button
          type="button"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted"
          :aria-label="prefs.theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'"
          @click="prefs.toggleTheme"
        >
          <span class="text-xl" aria-hidden="true">{{ prefs.theme === 'dark' ? '☀️' : '🌙' }}</span>
          Thème
        </button>
      </div>
    </nav>
  </div>
</template>
