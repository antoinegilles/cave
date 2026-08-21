import { eventBatchSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { logEvent } from '../services/events.js'

/**
 * Ingestion des événements émis par le client (navigation, friction, choix de saisie).
 *
 * Volontairement **publique** : le premier pas du funnel d'inscription arrive avant toute
 * authentification. Mais l'identité, quand elle existe, vient **du token, jamais du corps** —
 * on ne laisse pas un client se faire passer pour quelqu'un d'autre. Un token ADMIN fait sortir
 * sans rien écrire (exclusion admin, garde serveur même si le client oublie de filtrer).
 */
export default async function eventRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!config.ANALYTICS_ENABLED) return reply.code(204).send()

    // Auth optionnelle : présente → on stampe l'identité ; absente → événement anonyme.
    let userId: string | null = null
    let role: string | null = null
    try {
      await req.jwtVerify()
      userId = req.user.sub
      role = req.user.role
    } catch {
      // Anonyme : funnel d'inscription avant la création du compte.
    }

    // Les admins sont exclus du traçage, quoi qu'envoie le client.
    if (role === 'ADMIN') return reply.code(204).send()

    const parsed = eventBatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    // Un anonyme peut fournir son anonId ; un utilisateur connu est identifié par son token.
    const anonId = userId ? null : (parsed.data.anonId ?? null)
    await Promise.all(
      parsed.data.events.map((event) =>
        logEvent(event.name, {
          userId,
          userRole: role,
          anonId,
          props: event.props,
          path: event.path ?? null,
        }),
      ),
    )

    return reply.code(204).send()
  })
}
