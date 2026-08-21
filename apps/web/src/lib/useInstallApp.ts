import { useNotificationsStore } from '../stores/notifications'
import { usePwaStore } from '../stores/pwa'

/**
 * Action « Installer l'application », partagée par le menu compte et l'offre proactive.
 *
 * Extraite pour que l'avatar/menu (désormais dans `AccountMenu`, réutilisé dans le hero et la
 * barre d'app) et l'offre d'installation de `App.vue` déclenchent exactement le même flux, sans
 * dupliquer la logique ni la feuille d'aide iOS (pilotée par `pwa.iosHelpOpen`).
 */
export function useInstallApp() {
  const pwa = usePwaStore()
  const notifications = useNotificationsStore()

  async function installApplication(): Promise<void> {
    if (pwa.installOfferVisible) pwa.dismissInstallOffer()
    if (pwa.needsIosInstructions) {
      pwa.iosHelpOpen = true
      return
    }
    try {
      await pwa.promptInstall()
    } catch {
      notifications.show(
        "L'installation n'a pas pu être lancée. Réessaie depuis le navigateur.",
        'error',
      )
    }
  }

  return { installApplication }
}
