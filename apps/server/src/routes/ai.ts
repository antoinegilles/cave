import { sommelierSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { GeminiError, isGeminiConfigured } from '../services/gemini.js'
import {
  QuotaExceededError,
  askSommelier,
  isSommelierEnabled,
  remainingQuota,
} from '../services/sommelier.js'

export default async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /** État du sommelier — pilote l'affichage du bouton ✨ et du compteur côté client. */
  app.get('/sommelier/status', async (req) => {
    const enabled = await isSommelierEnabled()
    return {
      enabled: enabled && isGeminiConfigured(),
      configured: isGeminiConfigured(),
      dailyQuota: config.AI_DAILY_QUOTA,
      remaining: enabled ? await remainingQuota(req.currentUser!.id) : 0,
      maxPromptLength: 250,
    }
  })

  app.post('/sommelier', {
    // Deuxième barrière devant le quota applicatif : borne les tentatives, y compris celles
    // qui échouent et ne consomment donc pas de crédit.
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    handler: async (req, reply) => {
      // Flag désactivé → 404 et non 403 : la fonctionnalité n'existe pas, point.
      if (!(await isSommelierEnabled())) {
        return reply.code(404).send({ error: 'Fonctionnalité indisponible' })
      }
      if (!isGeminiConfigured()) {
        return reply.code(503).send({ error: 'Le sommelier IA n’est pas configuré sur ce serveur.' })
      }

      const parsed = sommelierSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Requête invalide',
          issues: parsed.error.issues,
        })
      }

      try {
        return await askSommelier(req.currentUser!.id, parsed.data.prompt)
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          return reply.code(429).send({ error: error.message, remaining: 0 })
        }
        if (error instanceof GeminiError) {
          return reply.code(502).send({
            error: error.message,
            remaining: await remainingQuota(req.currentUser!.id),
          })
        }
        throw error
      }
    },
  })
}
