import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, setAccessToken } from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  /**
   * Restaure la session au chargement à partir du cookie de refresh.
   * Appelé une seule fois avant le premier rendu du routeur.
   */
  async function restore(): Promise<void> {
    try {
      const data = await api.post<{ accessToken: string; user: User }>('/api/auth/refresh')
      setAccessToken(data.accessToken)
      user.value = data.user
    } catch {
      user.value = null
      setAccessToken(null)
    } finally {
      ready.value = true
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const data = await api.post<{ accessToken: string; user: User }>('/api/auth/login', {
      email,
      password,
    })
    setAccessToken(data.accessToken)
    user.value = data.user
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout')
    } finally {
      user.value = null
      setAccessToken(null)
    }
  }

  return { user, ready, isAuthenticated, isAdmin, restore, login, logout }
})
