<script setup lang="ts">
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { useNotificationsStore } from '../stores/notifications'

const notifications = useNotificationsStore()
</script>

<template>
  <aside
    class="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96"
    aria-label="Notifications"
  >
    <TransitionGroup name="notification">
      <div
        v-for="notification in notifications.items"
        :key="notification.id"
        :role="notification.tone === 'error' ? 'alert' : 'status'"
        :aria-live="notification.tone === 'error' ? 'assertive' : 'polite'"
        class="pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-surface p-3 shadow-float"
        :class="
          notification.tone === 'error'
            ? 'border-danger text-danger'
            : 'border-success text-success'
        "
      >
        <ExclamationCircleIcon
          v-if="notification.tone === 'error'"
          class="mt-0.5 h-5 w-5 shrink-0"
          aria-hidden="true"
        />
        <CheckCircleIcon v-else class="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm font-medium">{{ notification.message }}</p>
        <button
          type="button"
          class="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-text"
          :aria-label="`Fermer la notification : ${notification.message}`"
          @click="notifications.dismiss(notification.id)"
        >
          <XMarkIcon class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </aside>
</template>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.notification-enter-from,
.notification-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .notification-enter-active,
  .notification-leave-active {
    transition: none;
  }

  .notification-enter-from,
  .notification-leave-to {
    transform: none;
  }
}
</style>
