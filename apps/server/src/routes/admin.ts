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
    const since = new Date(Date.now() - days * 86_400_000)
    const where = { createdAt: { gte: since } }

    const [byName, registerErrors, addMethods, users, aiCount] = await Promise.all([
      prisma.event.groupBy({ by: ['name'], where, _count: { _all: true } }),
      // Motifs d'échec d'inscription (reason est dans props JSON → agrégé en mémoire ci-dessous).
      prisma.event.findMany({ where: { ...where, name: 'register_error' }, select: { props: true } }),
      prisma.event.findMany({ where: { ...where, name: 'add_method_selected' }, select: { props: true } }),
      prisma.user.findMany({
        where: { role: { not: 'ADMIN' } },
        select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.aiQuery.count({ where: { ...where, error: null } }),
    ])

    const count = (name: string) =>
      byName.find((row) => row.name === name)?._count._all ?? 0

    // page_view distincts sur l'écran d'inscription = 1re marche du funnel.
    const registerViews = await prisma.event.findMany({
      where: { ...where, name: 'page_view' },
      select: { anonId: true, props: true },
    })
    const registerPageAnon = new Set(
      registerViews
        .filter((e) => safeProps(e.props).name === 'register')
        .map((e) => e.anonId ?? '?'),
    ).size

    // Activation nominative : quels utilisateurs ont ajouté ≥1 bouteille / se sont connectés.
    const activity = await prisma.event.groupBy({
      by: ['userId', 'name'],
      where: { ...where, userId: { not: null }, name: { in: ['login_success', 'bottle_added'] } },
      _count: { _all: true },
    })
    const bottleCounts = await prisma.bottle.groupBy({
      by: ['ownerId'],
      where: { status: 'IN_CELLAR' },
      _count: { _all: true },
    })
    const perUser = users.map((u) => {
      const logins = activity.find((a) => a.userId === u.id && a.name === 'login_success')?._count._all ?? 0
      const added = activity.find((a) => a.userId === u.id && a.name === 'bottle_added')?._count._all ?? 0
      const bottles = bottleCounts.find((b) => b.ownerId === u.id)?._count._all ?? 0
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        logins,
        activated: added > 0 || bottles > 0,
        bottles,
      }
    })

    return {
      windowDays: days,
      registration: {
        pageViews: registerPageAnon,
        submitted: count('register_submitted'),
        success: count('register_success'),
        errors: tally(registerErrors.map((e) => String(safeProps(e.props).reason ?? 'inconnu'))),
      },
      activation: {
        newUsers: users.filter((u) => u.createdAt >= since).length,
        activatedUsers: perUser.filter((u) => u.activated).length,
        totalUsers: users.length,
      },
      add: {
        methods: tally(addMethods.map((e) => String(safeProps(e.props).method ?? 'inconnu'))),
        bottlesAdded: count('bottle_added'),
      },
      search: {
        performed: count('search_performed'),
        sommelier: aiCount,
      },
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
