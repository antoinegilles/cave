import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from './notifications'

describe('notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('conserve un message dans le store global jusqu’à sa fermeture', () => {
    const notifications = useNotificationsStore()
    const id = notifications.show('Emplacements 15 et 17 libérés.', 'success', 0)

    expect(useNotificationsStore().items).toEqual([
      expect.objectContaining({ id, message: 'Emplacements 15 et 17 libérés.', tone: 'success' }),
    ])

    notifications.dismiss(id)
    expect(notifications.items).toEqual([])
  })

  it('retire automatiquement un message après sa durée annoncée', () => {
    const notifications = useNotificationsStore()
    notifications.show('Dégustation mise à jour.', 'success', 4_000)

    vi.advanceTimersByTime(3_999)
    expect(notifications.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(notifications.items).toHaveLength(0)
  })
})
