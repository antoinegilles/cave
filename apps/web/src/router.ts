import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/inscription', name: 'register', component: () => import('./views/RegisterView.vue'), meta: { public: true } },
    { path: '/', name: 'cellar', component: () => import('./views/CellarView.vue') },
    { path: '/add', name: 'add', component: () => import('./views/AddBottleView.vue') },
    { path: '/bottle/:id', name: 'bottle', component: () => import('./views/BottleView.vue') },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue') },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (!to.meta['public'] && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta['public'] && auth.isAuthenticated) {
    return { name: 'cellar' }
  }
  if (to.meta['admin'] && !auth.isAdmin) {
    return { name: 'cellar' }
  }
  return true
})

export default router
