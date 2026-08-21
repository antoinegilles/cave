import { createPinia } from 'pinia'
import { createApp, watch } from 'vue'
import App from './App.vue'
import './assets/main.css'
import { initAnalytics } from './lib/analytics'
import router from './router'
import { useAuthStore } from './stores/auth'
import { usePwaStore } from './stores/pwa'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // Traçage produit : garantit l'anonId et branche le flush aux fermetures d'onglet. Le store
  // auth ajuste ensuite l'activation selon le rôle (les admins sont exclus).
  initAnalytics()

  // Les événements d'installation et de connectivité peuvent arriver dès le chargement :
  // on les écoute avant toute tentative réseau de restauration de session.
  const pwa = usePwaStore(pinia)
  pwa.initialize()

  // La session est restaurée AVANT d'installer le routeur : sans ça, le garde de navigation
  // redirigerait vers /login à chaque rechargement alors que le cookie de refresh est valide.
  // Encapsulé dans une fonction plutôt qu'en await top-level, non supporté par la cible de
  // build (Safari 14 et consorts) — or l'app est destinée à un téléphone.
  const auth = useAuthStore(pinia)
  await auth.restore()
  watch(
    () => pwa.isOnline,
    (online) => {
      if (online) void auth.revalidate()
    },
    { immediate: true },
  )

  app.use(router)
  watch(
    () => auth.isAuthenticated,
    (authenticated) => {
      // Une vraie réponse 401 invalide la session et doit sortir immédiatement d'une vue
      // protégée. Une panne réseau ne passe jamais ici : le profil hors-ligne est conservé.
      if (!authenticated && auth.ready && !router.currentRoute.value.meta['public']) {
        void router.replace({
          name: 'login',
          query: { redirect: router.currentRoute.value.fullPath },
        })
      }
    },
  )
  app.mount('#app')
}

void bootstrap()
