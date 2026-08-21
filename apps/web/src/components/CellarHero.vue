<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useCellarStore } from '../stores/cellar'
import AccountMenu from './AccountMenu.vue'

/**
 * En-tête « hero » de l'écran Ma cave.
 *
 * Regroupe l'identité (surnom + titre), l'avatar/menu compte, et les trois chiffres clés en
 * grand. Bloc sombre constant (teinte de marque `--color-wine-red`, texte clair) dans les
 * deux thèmes — comme une couverture. Purement présentationnel : lit les stores.
 *
 * L'avatar n'apparaît que sur téléphone (`md:hidden`) : sur bureau, la barre d'app conserve
 * son propre avatar, on évite le doublon.
 */

const props = defineProps<{ wines: number }>()

const auth = useAuthStore()
const cellar = useCellarStore()

/** « CAVE DE {NOM} » — nom du propriétaire consulté, sinon le sien. */
const ownerName = computed(() => cellar.viewingUser?.name ?? auth.user?.name ?? '')
</script>

<template>
  <section
    class="relative -mx-3 overflow-hidden rounded-b-3xl px-5 pb-5 text-white shadow-float sm:-mx-4 md:mx-0 md:rounded-3xl"
    style="
      padding-top: max(env(safe-area-inset-top), 1.5rem);
      background-image: linear-gradient(
        160deg,
        color-mix(in srgb, var(--color-wine-red) 82%, #000) 0%,
        var(--color-wine-red) 100%
      );
    "
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
          Cave de {{ ownerName }}
        </p>
        <h1 class="mt-1 font-display text-4xl font-semibold leading-tight">Ma cave</h1>
      </div>
      <!-- Avatar + menu compte, téléphone uniquement (bureau : barre d'app). -->
      <div class="shrink-0 md:hidden">
        <AccountMenu align="right" />
      </div>
    </div>

    <!-- Trois chiffres clés, séparés par des filets. -->
    <dl class="mt-5 flex items-stretch">
      <div class="flex-1 pr-4">
        <dd class="font-display text-3xl font-semibold leading-none tabular-nums">
          {{ cellar.totalBottles }}
        </dd>
        <dt class="mt-1 text-sm text-white/60">
          {{ cellar.totalBottles > 1 ? 'bouteilles' : 'bouteille' }}
        </dt>
      </div>
      <div class="flex-1 border-l border-white/20 px-4">
        <dd class="font-display text-3xl font-semibold leading-none tabular-nums">
          {{ props.wines }}
        </dd>
        <dt class="mt-1 text-sm text-white/60">{{ props.wines > 1 ? 'vins' : 'vin' }}</dt>
      </div>
      <div class="flex-1 border-l border-white/20 pl-4">
        <dd class="font-display text-3xl font-semibold leading-none tabular-nums">
          {{ cellar.freeSlots }}
        </dd>
        <dt class="mt-1 text-sm text-white/60">places libres</dt>
      </div>
    </dl>
  </section>
</template>
