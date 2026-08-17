import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NotificationTone = 'success' | 'error'

export interface AppNotification {
  id: number
  message: string
  tone: NotificationTone
}

let nextId = 1

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function dismiss(id: number): void {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  function show(message: string, tone: NotificationTone = 'success', duration = 6_000): number {
    const id = nextId++
    items.value.push({ id, message, tone })

    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    }
    return id
  }

  return { items, show, dismiss }
})
