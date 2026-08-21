<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../lib/api'

/**
 * Page d'accueil publique la vitrine de l'app pour un visiteur non connecté.
 *
 * Le fil conducteur : un verre de vin qui se remplit à mesure qu'on descend la page. Le
 * niveau est piloté par la progression du défilement (throttlée en rAF). On respecte
 * `prefers-reduced-motion` : le verre s'affiche plein, sans animation.
 */

const fill = ref(0)
const registrationOpen = ref(true)
const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let ticking = false
function onScroll(): void {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    // Le verre est plein après ~0,85 écran de défilement : assez tôt pour être satisfaisant.
    const distance = window.innerHeight * 0.85
    fill.value = Math.min(1, Math.max(0, window.scrollY / distance))
    ticking = false
  })
}

let observer: IntersectionObserver | null = null

onMounted(async () => {
  if (reduceMotion) {
    fill.value = 1
  } else {
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  // Révèle les sections en douceur à leur entrée dans le viewport.
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
  if (reduceMotion || typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('is-visible'))
  } else {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer?.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15 },
    )
    targets.forEach((el) => observer?.observe(el))
  }

  try {
    const config = await api.get<{ registrationOpen: boolean }>('/api/auth/config')
    registrationOpen.value = config.registrationOpen
  } catch {
    registrationOpen.value = true
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  observer?.disconnect()
})
</script>

<template>
  <div class="landing min-h-dvh bg-bg text-text">
    <!-- Barre supérieure minimale -->
    <header class="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-text shadow-card" aria-hidden="true">C</span>
          <span class="font-display text-xl font-semibold">Cave</span>
        </div>
        <RouterLink
          :to="{ name: 'login' }"
          class="rounded-xl px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          Se connecter
        </RouterLink>
      </div>
    </header>

    <!-- HERO -->
    <section class="relative overflow-hidden">
      <!-- Halo décoratif -->
      <div
        class="pointer-events-none absolute inset-0 -z-10"
        style="background: radial-gradient(60rem 40rem at 70% -10%, color-mix(in srgb, var(--color-wine-red) 14%, transparent), transparent 70%);"
        aria-hidden="true"
      />
      <div class="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2 md:py-24">
        <div data-reveal class="reveal">
          <p class="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Ta cave à vin, en vrai
          </p>
          <h1 class="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">
            Retrouve chaque bouteille en un&nbsp;coup&nbsp;d'œil.
          </h1>
          <p class="mt-5 max-w-md text-lg text-muted">
            Cave range ta collection casier par casier. Tu cherches un vin&nbsp;: l'emplacement
            s'allume sur le plan. Fini de fouiller à quatre pattes.
          </p>
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <RouterLink
              v-if="registrationOpen"
              :to="{ name: 'register' }"
              class="rounded-2xl bg-accent px-6 py-3.5 text-lg font-semibold text-accent-text shadow-float transition-colors hover:bg-accent-hover"
            >
              Créer un compte gratuit
            </RouterLink>
            <RouterLink
              :to="{ name: 'login' }"
              class="rounded-2xl border border-line bg-surface px-6 py-3.5 text-lg font-semibold text-text transition-colors hover:bg-surface-hover"
            >
              J'ai déjà un compte
            </RouterLink>
          </div>
        </div>

        <!-- Le verre qui se remplit -->
        <div class="flex justify-center md:justify-end" :style="{ '--fill': fill }">
          <svg
            class="h-[46vh] max-h-[420px] w-auto drop-shadow-xl"
            viewBox="0 0 220 360"
            role="img"
            aria-label="Un verre de vin qui se remplit à mesure que l'on descend la page"
          >
            <defs>
              <linearGradient id="wine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#9a2547" />
                <stop offset="1" stop-color="#5c1228" />
              </linearGradient>
              <clipPath id="bowl">
                <path d="M58 42 C58 116 82 162 110 162 C138 162 162 116 162 42 A54 12 0 0 1 58 42 Z" />
              </clipPath>
            </defs>

            <!-- Vin (clippé au bol, monte avec --fill) -->
            <g clip-path="url(#bowl)">
              <rect
                class="liquid"
                x="50"
                y="34"
                width="120"
                height="130"
                fill="url(#wine)"
              />
              <!-- Reflet sur la surface du vin -->
              <ellipse class="liquid-top" cx="110" cy="34" rx="52" ry="7" fill="#b34a67" opacity="0.55" />
            </g>

            <!-- Verre : contour -->
            <g fill="none" stroke="color-mix(in srgb, var(--color-wine-red) 45%, transparent)" stroke-width="3" stroke-linejoin="round">
              <ellipse cx="110" cy="40" rx="56" ry="13" />
              <path d="M54 40 C54 120 80 168 110 168 C140 168 166 120 166 40" />
              <path d="M104 168 L102 286 L118 286 L116 168" />
              <path d="M70 296 C70 289 86 285 110 285 C134 285 150 289 150 296" />
            </g>
            <!-- Éclat de verre -->
            <path d="M72 52 C70 96 80 132 98 150" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.35" />
          </svg>
        </div>
      </div>
    </section>

    <!-- FONCTIONNALITÉS -->
    <section class="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <div class="grid gap-5 md:grid-cols-3">
        <div data-reveal class="reveal rounded-3xl border border-line bg-surface p-7 shadow-card">
          <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">💡</div>
          <h3 class="font-display text-xl font-semibold">Le plan qui s'allume</h3>
          <p class="mt-2 text-muted">
            Chaque bouteille occupe un emplacement numéroté. Une recherche, et le bon casier
            s'illumine comme une carte au trésor de ta cave.
          </p>
        </div>
        <div data-reveal class="reveal rounded-3xl border border-line bg-surface p-7 shadow-card" style="transition-delay: 80ms">
          <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">🍇</div>
          <h3 class="font-display text-xl font-semibold">Un sommelier à la demande</h3>
          <p class="mt-2 text-muted">
            Décris un plat ou une envie, et l'IA te conseille le vin parfait parmi ceux que
            tu possèdes déjà, pas une liste de courses.
          </p>
        </div>
        <div data-reveal class="reveal rounded-3xl border border-line bg-surface p-7 shadow-card" style="transition-delay: 160ms">
          <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">📸</div>
          <h3 class="font-display text-xl font-semibold">Pensé pour la vraie vie</h3>
          <p class="mt-2 text-muted">
            Ajoute une bouteille en photographiant l'étiquette. Accords mets-vins, notes,
            millésimes, prix : tout est là, rien à ressaisir.
          </p>
        </div>
      </div>
    </section>

    <!-- COMMENT ÇA MARCHE -->
    <section class="border-y border-line bg-surface-2/50">
      <div class="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <h2 data-reveal class="reveal text-center font-display text-3xl font-semibold sm:text-4xl">
          Trois étapes, et c'est rangé.
        </h2>
        <div class="mt-12 grid gap-8 md:grid-cols-3">
          <div v-for="(step, i) in [
            { t: 'Crée ton casier', d: 'Décris ta cave physique : de tel numéro à tel numéro. Le plan se génère tout seul.' },
            { t: 'Ajoute tes bouteilles', d: 'Photo de l\'étiquette, code-barres ou saisie à la main. Chacune reçoit son emplacement.' },
            { t: 'Cherche, ça s\'allume', d: 'Un plat, un domaine, une couleur… l\'emplacement de la bonne bouteille s\'illumine.' },
          ]" :key="i" data-reveal class="reveal" :style="{ transitionDelay: `${i * 80}ms` }">
            <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent font-display text-lg font-bold text-accent-text">
              {{ i + 1 }}
            </div>
            <h3 class="font-display text-xl font-semibold">{{ step.t }}</h3>
            <p class="mt-2 text-muted">{{ step.d }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA FINAL -->
    <section class="mx-auto max-w-3xl px-4 py-20 text-center md:py-28">
      <div data-reveal class="reveal">
        <h2 class="font-display text-3xl font-semibold sm:text-4xl">Prêt à ranger ta cave&nbsp;?</h2>
        <p class="mx-auto mt-3 max-w-md text-lg text-muted">
          Gratuit, sans installation. Crée ton compte et pose ta première bouteille en deux
          minutes.
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <RouterLink
            v-if="registrationOpen"
            :to="{ name: 'register' }"
            class="rounded-2xl bg-accent px-7 py-4 text-lg font-semibold text-accent-text shadow-float transition-colors hover:bg-accent-hover"
          >
            Créer un compte gratuit
          </RouterLink>
          <RouterLink
            v-else
            :to="{ name: 'login' }"
            class="rounded-2xl bg-accent px-7 py-4 text-lg font-semibold text-accent-text shadow-float transition-colors hover:bg-accent-hover"
          >
            Se connecter
          </RouterLink>
        </div>
      </div>
    </section>

    <footer class="border-t border-line">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row">
        <p>Cave ta cave à vin, emplacement par emplacement.</p>
        <RouterLink :to="{ name: 'login' }" class="font-semibold text-accent hover:underline">
          Se connecter
        </RouterLink>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Niveau du vin : piloté par --fill (0 → 1), ancré au fond du bol. */
.liquid {
  transform: scaleY(var(--fill, 0));
  transform-box: fill-box;
  transform-origin: bottom;
  transition: transform 0.12s linear;
}
.liquid-top {
  /* La surface descend/ monte avec le niveau (164 = fond du bol, 34 = haut). */
  transform: translateY(calc((1 - var(--fill, 0)) * 128px));
  transform-box: fill-box;
  transition: transform 0.12s linear;
  opacity: calc(0.15 + var(--fill, 0) * 0.5);
}

/* Révélation douce au défilement. */
.reveal {
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 0.6s ease,
    transform 0.6s ease;
}
.reveal.is-visible {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .liquid,
  .liquid-top,
  .reveal {
    transition: none;
  }
  .reveal {
    opacity: 1;
    transform: none;
  }
}
</style>
