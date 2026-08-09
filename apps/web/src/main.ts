import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import router from './router'
import { useAuthStore } from './stores/auth'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())

  // La session est restaurée AVANT d'installer le routeur : sans ça, le garde de navigation
  // redirigerait vers /login à chaque rechargement alors que le cookie de refresh est valide.
  // Encapsulé dans une fonction plutôt qu'en await top-level, non supporté par la cible de
  // build (Safari 14 et consorts) — or l'app est destinée à un téléphone.
  await useAuthStore().restore()

  app.use(router)
  app.mount('#app')
}

void bootstrap()
