import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { setNetworkStateHandler } from '../lib/api'
import { detectPwaEnvironment } from '../lib/pwa'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

export const usePwaStore = defineStore('pwa', () => {
  const initialized = ref(false)
  const isOnline = ref(true)
  const isIos = ref(false)
  const isStandalone = ref(false)
  const nativeInstallAvailable = ref(false)
  const updateAvailable = ref(false)
  const updating = ref(false)
  const registrationError = ref(false)

  let installPrompt: BeforeInstallPromptEvent | null = null
  let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

  const needsIosInstructions = computed(
    () => isIos.value && !isStandalone.value && !nativeInstallAvailable.value,
  )
  const canInstall = computed(
    () => !isStandalone.value && (nativeInstallAvailable.value || needsIosInstructions.value),
  )

  function refreshEnvironment(): void {
    const navigatorWithStandalone = navigator as NavigatorWithStandalone
    const environment = detectPwaEnvironment({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      navigatorStandalone: navigatorWithStandalone.standalone,
    })
    isIos.value = environment.isIos
    isStandalone.value = environment.isStandalone
  }

  function initialize(): void {
    if (initialized.value || typeof window === 'undefined') return
    initialized.value = true
    isOnline.value = navigator.onLine
    setNetworkStateHandler((reachable) => {
      isOnline.value = navigator.onLine && reachable
    })
    refreshEnvironment()

    window.addEventListener('online', () => {
      isOnline.value = true
    })
    window.addEventListener('offline', () => {
      isOnline.value = false
    })
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      installPrompt = event as BeforeInstallPromptEvent
      nativeInstallAvailable.value = true
    })
    window.addEventListener('appinstalled', () => {
      installPrompt = null
      nativeInstallAvailable.value = false
      isStandalone.value = true
    })
    const displayMode = window.matchMedia('(display-mode: standalone)')
    if (typeof displayMode.addEventListener === 'function') {
      displayMode.addEventListener('change', refreshEnvironment)
    } else {
      displayMode.addListener(refreshEnvironment)
    }

    try {
      updateServiceWorker = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateAvailable.value = true
        },
        onRegisterError(error) {
          registrationError.value = true
          console.error("Impossible d'enregistrer le service worker", error)
        },
      })
    } catch (error) {
      registrationError.value = true
      console.error("Impossible d'initialiser le service worker", error)
    }
  }

  async function promptInstall(): Promise<boolean> {
    const prompt = installPrompt
    if (!prompt) return false

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    installPrompt = null
    nativeInstallAvailable.value = false
    return outcome === 'accepted'
  }

  async function applyUpdate(): Promise<void> {
    if (!updateAvailable.value || !updateServiceWorker || updating.value) return
    updating.value = true
    try {
      // Le rechargement n'arrive qu'après le choix explicite de la personne.
      await updateServiceWorker(true)
    } finally {
      updating.value = false
    }
  }

  function dismissUpdate(): void {
    updateAvailable.value = false
  }

  return {
    initialized,
    isOnline,
    isIos,
    isStandalone,
    canInstall,
    needsIosInstructions,
    updateAvailable,
    updating,
    registrationError,
    initialize,
    promptInstall,
    applyUpdate,
    dismissUpdate,
  }
})
