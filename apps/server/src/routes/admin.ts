import { FEATURE_FLAGS, createUserSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import { hashPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import { vivinoBreaker } from '../providers/vivino.js'

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

    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true, name: true, role: true },
    })

    return reply.code(201).send({ user })
  })

  app.delete('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    if (id === req.currentUser!.id) {
      return reply.code(400).send({ error: 'Tu ne peux pas supprimer ton propre compte.' })
    }

    // Les bouteilles référencent leur auteur (onDelete: Restrict) : supprimer le dernier
    // admin ou un compte ayant rangé des bouteilles casserait l'historique.
    const bottles = await prisma.bottle.count({ where: { addedById: id } })
    if (bottles > 0) {
      return reply.code(409).send({
        error: `Ce compte a ajouté ${bottles} bouteille(s). Le supprimer effacerait l’historique.`,
      })
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
