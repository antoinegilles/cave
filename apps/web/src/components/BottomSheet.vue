<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { nextTick, onUnmounted, ref, useId, watch } from 'vue'
import { lockScroll, unlockScroll } from '../lib/scrollLock'

/**
 * Feuille glissant depuis le bas, modale centrée sur grand écran.
 *
 * L'app n'avait aucune primitive de dialogue : le plan du casier réservait ses
 * informations au survol — donc à la souris — et les suppressions passaient par un
 * `window.confirm()` natif. Cette brique sert les deux usages.
 */

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    /** Faux pour une confirmation destructrice : on ne ferme pas par mégarde. */
    dismissOnBackdrop?: boolean
  }>(),
  { dismissOnBackdrop: true },
)

const emit = defineEmits<{ close: [] }>()

const titleId = `sheet-title-${useId()}`
const panel = ref<HTMLElement | null>(null)
let restoreFocusTo: HTMLElement | null = null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === panel.value,
  )
}

/** Piège de focus : la tabulation ne doit pas repartir dans la page derrière. */
function onTab(event: KeyboardEvent): void {
  const items = focusables()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (event.shiftKey && (active === first || active === panel.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreFocusTo = document.activeElement as HTMLElement | null
      lockScroll()
      await nextTick()
      ;(focusables()[0] ?? panel.value)?.focus()
      return
    }
    unlockScroll()
    restoreFocusTo?.focus()
    restoreFocusTo = null
  },
  { immediate: true },
)

// Un démontage pendant l'ouverture (navigation) laisserait la page bloquée et inerte.
onUnmounted(() => {
  if (!props.open) return
  unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="backdrop">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-text/40"
        @click="dismissOnBackdrop && emit('close')"
      />
    </Transition>

    <Transition name="sheet">
      <div
        v-if="open"
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-float outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[80dvh] sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        @keydown.esc.prevent="emit('close')"
        @keydown.tab="onTab"
      >
        <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden="true" />

        <div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-3">
          <h2 :id="titleId" class="min-w-0 font-display text-lg font-semibold text-text">
            {{ title }}
          </h2>
          <button
            type="button"
            class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover"
            aria-label="Fermer"
            @click="emit('close')"
          >
            <XMarkIcon class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <slot />
        </div>

        <div
          v-if="$slots.actions"
          class="shrink-0 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <slot name="actions" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}

.sheet-enter-active,
.sheet-leave-active {
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

/*
 * Le glissement ne vaut que pour la feuille basse. Au-dessus de `sm:` le panneau est
 * centré par `-translate-x-1/2 -translate-y-1/2` : lui imposer un `translateY` d'entrée
 * écraserait ce centrage et le ferait surgir de travers.
 */
@media (max-width: 639.98px) {
  .sheet-enter-from,
  .sheet-leave-to {
    transform: translateY(100%);
  }
}

/* `main.css` neutralise déjà les durées ; on retire en plus le glissement. */
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-from,
  .sheet-leave-to {
    transform: none;
  }
}
</style>
