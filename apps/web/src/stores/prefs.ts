import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * Préférences d'affichage persistées dans le navigateur.
 *
 * Ni le thème ni le mode d'affichage ne transitent par le serveur : ce sont des choix
 * d'appareil. Le père consulte sur son téléphone, le fils sur son portable, chacun garde
 * ses réglages sans qu'ils se marchent dessus.
 */

export type Theme = 'light' | 'dark'
export type ViewMode = 'list' | 'rack'

const THEME_KEY = 'cave-theme'
const VIEW_KEY = 'cave-view-mode'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
  } catch {
    // Navigation privée ou stockage refusé : on retombe sur le défaut sans casser l'app.
    return fallback
  }
}

/** Applique la classe attendue par la variante `dark` de Tailwind. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export const usePrefsStore = defineStore('prefs', () => {
  // Défaut volontaire : clair, même si le système est en sombre.
  const theme = ref<Theme>(readStored(THEME_KEY, ['light', 'dark'] as const, 'light'))
  const viewMode = ref<ViewMode>(readStored(VIEW_KEY, ['list', 'rack'] as const, 'list'))

  watch(
    theme,
    (value) => {
      applyTheme(value)
      try {
        localStorage.setItem(THEME_KEY, value)
      } catch {
        // Sans persistance, le thème reste valable pour la session en cours.
      }
    },
    { immediate: true },
  )

  watch(viewMode, (value) => {
    try {
      localStorage.setItem(VIEW_KEY, value)
    } catch {
      // idem
    }
  })

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, viewMode, toggleTheme }
})
