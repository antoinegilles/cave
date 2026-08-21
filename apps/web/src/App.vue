<script setup lang="ts">
import {
  ArrowPathIcon,
  ChartBarIcon,
  ClockIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline'
import { computed, watch, type Component } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AccountMenu from './components/AccountMenu.vue'
import BottomSheet from './components/BottomSheet.vue'
import NotificationHost from './components/NotificationHost.vue'
import { useInstallApp } from './lib/useInstallApp'
import { useAuthStore } from './stores/auth'
import { useCellarStore } from './stores/cellar'
import { useNotificationsStore } from './stores/notifications'
import { usePwaStore } from './stores/pwa'

/**
 * Coque de l'application.
 *
 * Trois principes issus des retours d'usage :
 *  - « Ajouter une bouteille » est L'action principale, pas un lien parmi d'autres :
 *    bouton plein sur bureau, bouton central surélevé sur téléphone.
 *  - « Admin » quitte la navigation principale pour le menu compte : c'est une page de
 *    réglages, pas une destination quotidienne. La barre reste ainsi lisible.
 *  - La barre basse est pilotée par `mainNav`. Elle a longtemps itéré `mainNav.slice(0,1)`
 *    puis codé les autres entrées en dur, si bien qu'elle pouvait diverger de la
 *    navigation bureau sans que rien ne le signale.
 */

const auth = useAuthStore()
const cellar = useCellarStore()
const notifications = useNotificationsStore()
const pwa = usePwaStore()
const route = useRoute()
const router = useRouter()
const { installApplication } = useInstallApp()

const showChrome = computed(() => auth.isAuthenticated && !route.meta['public'])

// La barre d'app est masquée sur téléphone dans « Ma cave » : le hero immersif prend sa place
// (titre, avatar, chiffres). Elle reste sur bureau et sur toutes les autres routes.
const hideTopBarOnMobile = computed(() => route.name === 'cellar')

// La page d'accueil gère sa propre mise en page pleine largeur (sections immersives).
const isLanding = computed(() => route.name === 'landing')

interface NavItem {
  name: string
  label: string
  /** Libellé court de la barre basse : « Historique » est déjà à l'étroit à 320 px. */
  short: string
  icon: Component
  query?: Record<string, string>
}

const mainNav: NavItem[] = [
  { name: 'cellar', label: 'Ma cave', short: 'Ma cave', icon: HomeIcon },
  { name: 'history', label: 'Historique', short: 'Historique', icon: ClockIcon },
  { name: 'stats', label: 'Statistiques', short: 'Stats', icon: ChartBarIcon },
]

/**
 * Chercher est un onglet, pas une route : la recherche vit dans la vue cave et porte un
 * état vivant, qu'une seconde route dupliquerait. La query est consommée puis effacée par
 * `CellarView`, ce qui permet de re-déclencher le focus depuis n'importe où.
 */
const searchTab: NavItem = {
  name: 'cellar',
  label: 'Chercher',
  short: 'Chercher',
  icon: MagnifyingGlassIcon,
  query: { focus: 'search' },
}

/** Deux onglets, le bouton d'ajout, deux onglets. */
const navLeft = computed(() => [mainNav[0]!, mainNav[1]!])
const navRight = computed(() => [mainNav[2]!, searchTab])

function isCurrent(item: NavItem): boolean {
  if (item.query) return false
  return route.name === item.name
}

// Les données Pinia vivent tant que l'onglet reste ouvert. Un changement de session doit
// donc purger la cave avant que le nouveau compte ne monte sa vue.
let signedInUserId = auth.user?.id ?? null
watch(
  () => auth.user?.id ?? null,
  (currentUserId) => {
    if (currentUserId === signedInUserId) return
    signedInUserId = currentUserId
    cellar.reset()
  },
  { flush: 'sync' },
)

async function leaveViewedCellar(): Promise<void> {
  cellar.stopViewing()
  await router.push({ name: 'cellar' })
  await cellar.loadRacks()
}

async function updateApplication(): Promise<void> {
  try {
    await pwa.applyUpdate()
  } catch {
    notifications.show("La mise à jour n'a pas pu être appliquée. Réessaie dans un instant.", 'error')
  }
}
</script>

<template>
  <div class="min-h-dvh bg-bg">
    <NotificationHost />
    <a
      href="#contenu"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-text"
    >
      Aller au contenu
    </a>

    <header
      v-if="showChrome"
      class="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur"
      :class="hideTopBarOnMobile ? 'hidden md:block' : ''"
    >
      <div class="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-4">
        <RouterLink :to="{ name: 'cellar' }" class="tap flex shrink-0 items-center gap-2 rounded-xl">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-text shadow-card" aria-hidden="true">C</span>
          <span class="hidden font-display text-xl font-semibold text-text min-[360px]:inline">Cave</span>
        </RouterLink>

        <nav class="ml-2 hidden gap-1 md:flex" aria-label="Navigation principale">
          <RouterLink
            v-for="item in mainNav"
            :key="item.name"
            :to="{ name: item.name }"
            class="tap flex items-center gap-2 rounded-xl px-3 py-2 font-medium transition-colors"
            :class="
              route.name === item.name
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-surface-hover hover:text-text'
            "
          >
            <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <!-- Action principale, toujours visible sur bureau -->
          <RouterLink
            v-if="!cellar.isReadOnly"
            :to="{ name: 'add' }"
            class="hidden items-center gap-2 rounded-xl bg-accent px-3 py-2.5 font-semibold text-accent-text transition-colors hover:bg-accent-hover md:flex lg:px-4"
            aria-label="Ajouter une bouteille"
          >
            <PlusIcon class="h-5 w-5" aria-hidden="true" /> <span class="hidden lg:inline">Ajouter une bouteille</span>
          </RouterLink>

          <AccountMenu align="right" />
        </div>
      </div>
    </header>

    <div
      v-if="showChrome && cellar.viewingUser"
      class="sticky z-20 border-b border-warning bg-warning-soft px-4 py-2.5 text-warning"
      :class="hideTopBarOnMobile ? 'top-0 md:top-[65px]' : 'top-[65px]'"
    >
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p class="text-sm font-semibold">
          Tu consultes la cave de {{ cellar.viewingUser.name }} — lecture seule
        </p>
        <button type="button" class="shrink-0 rounded-lg border border-warning px-3 py-1.5 text-sm font-semibold" @click="leaveViewedCellar">
          Quitter
        </button>
      </div>
    </div>

    <div
      v-if="!pwa.isOnline"
      role="status"
      aria-live="polite"
      class="border-b border-warning bg-warning-soft px-4 py-2.5 text-center text-sm font-medium text-warning"
    >
      Hors connexion — les données affichées peuvent dater. Les actions réseau sont
      indisponibles.
    </div>

    <div
      v-if="pwa.registrationError"
      role="alert"
      class="border-b border-warning bg-warning-soft px-4 py-2.5 text-center text-sm font-medium text-warning"
    >
      Le mode hors connexion et les mises à jour automatiques sont indisponibles sur cet
      appareil. L'application en ligne reste utilisable.
    </div>

    <div
      v-if="pwa.updateAvailable"
      role="status"
      aria-live="polite"
      class="border-b border-accent bg-accent-soft px-4 py-2.5 text-accent"
    >
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 sm:justify-between">
        <span class="text-sm font-medium">Une nouvelle version de Cave est disponible.</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-surface/70"
            :disabled="pwa.updating"
            @click="pwa.dismissUpdate"
          >
            Plus tard
          </button>
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-text hover:bg-accent-hover disabled:opacity-60"
            :disabled="pwa.updating"
            @click="updateApplication"
          >
            <ArrowPathIcon class="h-4 w-4" aria-hidden="true" />
            {{ pwa.updating ? 'Mise à jour…' : 'Mettre à jour' }}
          </button>
        </div>
      </div>
    </div>

    <main
      id="contenu"
      :class="
        isLanding
          ? ''
          : [
              'mx-auto max-w-5xl px-3 sm:px-4',
              showChrome ? 'pb-28 md:pb-10' : 'pb-7',
              // Sur téléphone dans « Ma cave », le hero démarre en haut (il gère l'encoche
              // lui-même) ; ailleurs, padding vertical normal.
              hideTopBarOnMobile ? 'pt-0 md:pt-7' : 'pt-5 sm:pt-7',
            ]
      "
    >
      <RouterView :key="`${String(route.name)}:${cellar.viewingUser?.id ?? 'self'}`" />
    </main>

    <!-- Barre basse : l'app se manipule debout devant la cave, le pouce en bas de l'écran. -->
    <nav
      v-if="showChrome"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgb(36_24_19/0.08)] backdrop-blur md:hidden"
      aria-label="Navigation"
    >
      <div class="flex items-end justify-around px-1">
        <RouterLink
          v-for="item in navLeft"
          :key="item.short"
          :to="{ name: item.name }"
          class="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[0.68rem] font-medium transition-colors"
          :class="isCurrent(item) ? 'text-accent' : 'text-muted'"
        >
          <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
          {{ item.short }}
        </RouterLink>

        <!-- Bouton central surélevé : impossible à manquer -->
        <RouterLink
          v-if="!cellar.isReadOnly"
          :to="{ name: 'add' }"
          class="-mt-4 flex min-w-16 flex-col items-center rounded-xl px-1"
          aria-label="Ajouter une bouteille"
        >
          <span
            class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-text shadow-float transition-transform active:scale-95"
            aria-hidden="true"
          >
            <PlusIcon class="h-7 w-7" />
          </span>
          <span class="mt-0.5 text-[0.7rem] font-medium text-accent">Ajouter</span>
        </RouterLink>

        <RouterLink
          v-for="item in navRight"
          :key="item.short"
          :to="{ name: item.name, query: item.query }"
          class="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[0.68rem] font-medium transition-colors"
          :class="isCurrent(item) ? 'text-accent' : 'text-muted'"
        >
          <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
          {{ item.short }}
        </RouterLink>
      </div>
    </nav>

    <BottomSheet
      :open="pwa.installOfferVisible"
      title="Installer Cave"
      @close="pwa.dismissInstallOffer"
    >
      <div class="space-y-3 text-text">
        <p>Installe Cave sur cet appareil pour l’ouvrir comme une application et la retrouver plus facilement.</p>
        <p v-if="pwa.needsIosInstructions" class="text-sm text-muted">Sur iPhone ou iPad, l’installation passe par le menu Partager de Safari.</p>
      </div>
      <template #actions>
        <div class="flex gap-3">
          <button type="button" class="rounded-xl border border-line px-4 py-3 font-medium text-muted" @click="pwa.dismissInstallOffer">Plus tard</button>
          <button type="button" class="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-text" @click="installApplication">
            {{ pwa.needsIosInstructions ? 'Voir les instructions' : 'Installer' }}
          </button>
        </div>
      </template>
    </BottomSheet>

    <BottomSheet
      :open="pwa.iosHelpOpen"
      title="Installer Cave sur cet appareil"
      @close="pwa.iosHelpOpen = false"
    >
      <div class="space-y-4 text-text">
        <p>
          iOS et iPadOS installent l'application depuis le menu de partage du navigateur.
        </p>
        <ol class="space-y-3">
          <li class="flex gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">1</span>
            <span>Ouvre cette page dans Safari, puis touche <ShareIcon class="inline h-5 w-5" aria-hidden="true" /> <strong>Partager</strong>.</span>
          </li>
          <li class="flex gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">2</span>
            <span>Choisis <strong>Sur l'écran d'accueil</strong>, puis confirme avec <strong>Ajouter</strong>.</span>
          </li>
        </ol>
      </div>
      <template #actions>
        <button
          type="button"
          class="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-text hover:bg-accent-hover"
          @click="pwa.iosHelpOpen = false"
        >
          J'ai compris
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
