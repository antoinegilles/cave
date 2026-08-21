import { FEATURE_FLAGS, createUserSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import { defaultCellarCreate } from '../lib/defaultCellar.js'
import { hashPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import { vivinoBreaker } from '../providers/vivino.js'

/** Les props d'un événement sont du TEXT JSON (SQLite) : on parse défensivement. */
function safeProps(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Compte les occurrences de chaque valeur : `['photo','photo','manual'] → {photo:2, manual:1}`. */
function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const value of values) out[value] = (out[value] ?? 0) + 1
  return out
}

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAdmin)

  app.get('/users', async () => ({
    users: await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  }))

  /** Pas d'inscription ouverte : les comptes sont créés par un administrateur. */
  app.post('/users', async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const email = parsed.data.email.toLowerCase()
    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: 'Cette adresse est déjà utilisée.' })
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prisma.$transaction((tx) =>
      tx.user.create({
        data: {
          email,
          name: parsed.data.name,
          role: parsed.data.role,
          passwordHash,
          racks: { create: defaultCellarCreate() },
        },
        select: { id: true, email: true, name: true, role: true },
      }),
    )

    return reply.code(201).send({ user })
  })

  app.delete('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    if (id === req.currentUser!.id) {
      return reply.code(400).send({ error: 'Tu ne peux pas supprimer ton propre compte.' })
    }

    await prisma.user.delete({ where: { id } })
    return { ok: true }
  })

  app.get('/flags', async () => {
    const flags = await prisma.featureFlag.findMany()
    return { flags }
  })

  app.patch('/flags/:key', async (req, reply) => {
    const { key } = req.params as { key: string }
    const known = Object.values(FEATURE_FLAGS) as string[]
    if (!known.includes(key)) return reply.code(404).send({ error: 'Flag inconnu' })

    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Requête invalide' })

    const flag = await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: parsed.data.enabled },
      update: { enabled: parsed.data.enabled },
    })

    return { flag }
  })

  /** Vue d'exploitation : état des providers, consommation IA, volume du cache. */
  app.get('/status', async () => {
    const since = new Date(Date.now() - 7 * 86_400_000)
    const [users, bottles, wines, cacheEntries, aiWeek] = await Promise.all([
      prisma.user.count(),
      prisma.bottle.count({ where: { status: 'IN_CELLAR' } }),
      prisma.wine.count(),
      prisma.scrapeCache.count(),
      prisma.aiQuery.count({ where: { createdAt: { gte: since }, error: null } }),
    ])

    return {
      counts: { users, bottles, wines, cacheEntries, aiQueriesLast7Days: aiWeek },
      vivino: { enabled: config.VIVINO_ENABLED, ...vivinoBreaker.status },
      ai: { dailyQuotaPerUser: config.AI_DAILY_QUOTA, grounding: config.AI_ENABLE_GROUNDING },
    }
  })

  /**
   * Traçage des parcours (analytics maison). Agrège la table `Event` sur une fenêtre glissante :
   * funnel d'inscription, activation/rétention nominative, méthodes d'ajout, usage recherche.
   * Les comptes ADMIN étant exclus à l'écriture, ces chiffres ne reflètent que les vrais
   * utilisateurs.
   */
  app.get('/analytics', async (req) => {
    const days = Math.min(Math.max(Number((req.query as { days?: string }).days) || 30, 1), 365)
    const now = Date.now()
    const since = new Date(now - days * 86_400_000)
    const where = { createdAt: { gte: since } }

    // Une seule lecture des événements de la fenêtre : tout est calculé en mémoire. À l'échelle
    // familiale c'est trivial, et ça évite une dizaine d'agrégations séparées.
    const [events, users, bottleCounts, aiCount] = await Promise.all([
      prisma.event.findMany({
        where,
        select: { name: true, userId: true, anonId: true, props: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: { not: 'ADMIN' } },
        select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bottle.groupBy({
        by: ['ownerId'],
        where: { status: 'IN_CELLAR' },
        _count: { _all: true },
      }),
      prisma.aiQuery.count({ where: { ...where, error: null } }),
    ])

    const count = (name: string) => events.filter((e) => e.name === name).length

    // Funnel d'inscription : 1re marche = anonymes distincts ayant vu l'écran d'inscription.
    const registerPageAnon = new Set(
      events
        .filter((e) => e.name === 'page_view' && safeProps(e.props).name === 'register')
        .map((e) => e.anonId ?? '?'),
    ).size

    // Frise d'activité : 14 derniers jours, une barre par jour (jours vides inclus).
    const timelineDays = Math.min(days, 14)
    const dayKey = (d: Date) => d.toLocaleDateString('en-CA') // YYYY-MM-DD en heure locale
    const timeline: {
      date: string
      total: number
      pageViews: number
      searches: number
      added: number
    }[] = []
    const buckets = new Map<string, (typeof timeline)[number]>()
    for (let i = timelineDays - 1; i >= 0; i--) {
      const row = {
        date: dayKey(new Date(now - i * 86_400_000)),
        total: 0,
        pageViews: 0,
        searches: 0,
        added: 0,
      }
      timeline.push(row)
      buckets.set(row.date, row)
    }
    for (const e of events) {
      const row = buckets.get(dayKey(e.createdAt))
      if (!row) continue
      row.total++
      if (e.name === 'page_view') row.pageViews++
      else if (e.name === 'search_performed') row.searches++
      else if (e.name === 'bottle_added') row.added++
    }

    // Écrans les plus vus (nom seul), et qualité de recherche (avec / sans résultat).
    const screens = tally(
      events
        .filter((e) => e.name === 'page_view')
        .map((e) => String(safeProps(e.props).name ?? 'inconnu')),
    )
    const searchWithResults = events.filter(
      (e) => e.name === 'search_performed' && safeProps(e.props).hasResults === true,
    ).length
    const searchPerformed = count('search_performed')

    // Rétention : utilisateurs identifiés actifs sur les 7 derniers jours vs les 7 précédents.
    const week = 7 * 86_400_000
    const activeIn = (from: number, to: number) =>
      new Set(
        events
          .filter((e) => e.userId && e.createdAt.getTime() >= from && e.createdAt.getTime() < to)
          .map((e) => e.userId),
      ).size

    // Activité nominative : dernière trace + comptes par utilisateur.
    const lastSeen = new Map<string, Date>()
    const loginCount = new Map<string, number>()
    const addedCount = new Map<string, number>()
    for (const e of events) {
      if (!e.userId) continue
      if (!lastSeen.has(e.userId) || e.createdAt > lastSeen.get(e.userId)!) {
        lastSeen.set(e.userId, e.createdAt)
      }
      if (e.name === 'login_success') loginCount.set(e.userId, (loginCount.get(e.userId) ?? 0) + 1)
      if (e.name === 'bottle_added') addedCount.set(e.userId, (addedCount.get(e.userId) ?? 0) + 1)
    }
    const perUser = users.map((u) => {
      const bottles = bottleCounts.find((b) => b.ownerId === u.id)?._count._all ?? 0
      const seen = lastSeen.get(u.id) ?? u.lastLoginAt
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
        lastSeen: seen,
        logins: loginCount.get(u.id) ?? 0,
        activated: (addedCount.get(u.id) ?? 0) > 0 || bottles > 0,
        bottles,
      }
    })

    return {
      windowDays: days,
      registration: {
        pageViews: registerPageAnon,
        submitted: count('register_submitted'),
        success: count('register_success'),
        errors: tally(
          events
            .filter((e) => e.name === 'register_error')
            .map((e) => String(safeProps(e.props).reason ?? 'inconnu')),
        ),
      },
      activation: {
        newUsers: users.filter((u) => u.createdAt >= since).length,
        activatedUsers: perUser.filter((u) => u.activated).length,
        totalUsers: users.length,
      },
      retention: {
        activeThisWeek: activeIn(now - week, now + 1),
        activeLastWeek: activeIn(now - 2 * week, now - week),
      },
      add: {
        methods: tally(
          events
            .filter((e) => e.name === 'add_method_selected')
            .map((e) => String(safeProps(e.props).method ?? 'inconnu')),
        ),
        bottlesAdded: count('bottle_added'),
      },
      search: {
        performed: searchPerformed,
        withResults: searchWithResults,
        sommelier: aiCount,
      },
      screens,
      timeline,
      users: perUser,
    }
  })

  /** Réarme manuellement le circuit Vivino après un blocage résolu. */
  app.post('/vivino/reset', async () => {
    vivinoBreaker.reset()
    return { ok: true, ...vivinoBreaker.status }
  })

  /** Purge le cache de scraping pour forcer un rafraîchissement des fiches. */
  app.delete('/cache', async () => {
    const { count } = await prisma.scrapeCache.deleteMany({})
    return { deleted: count }
  })
}
