import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  DEFAULT_SORT_DIRECTIONS,
  LIST_SORTS,
  type ListSort,
  type SortDirection,
} from '../lib/bottleSort'

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
const SORT_KEY = 'cave-list-sort'
const SORT_DIRECTION_KEY = 'cave-list-sort-direction'

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
  // Le tri se perdait à chaque retour depuis une fiche : c'est un réglage, pas un état
  // de navigation.
  const listSort = ref<ListSort>(readStored(SORT_KEY, LIST_SORTS, 'slot'))
  const listSortDirection = ref<SortDirection>(
    readStored(
      SORT_DIRECTION_KEY,
      ['asc', 'desc'] as const,
      DEFAULT_SORT_DIRECTIONS[listSort.value],
    ),
  )

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

  watch(listSort, (value) => {
    try {
      localStorage.setItem(SORT_KEY, value)
    } catch {
      // idem
    }
  })

  watch(listSortDirection, (value) => {
    try {
      localStorage.setItem(SORT_DIRECTION_KEY, value)
    } catch {
      // idem
    }
  })

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function selectSort(sort: ListSort): void {
    if (listSort.value === sort) {
      listSortDirection.value = listSortDirection.value === 'asc' ? 'desc' : 'asc'
      return
    }
    listSort.value = sort
    listSortDirection.value = DEFAULT_SORT_DIRECTIONS[sort]
  }

  return { theme, viewMode, listSort, listSortDirection, toggleTheme, selectSort }
})
