import { labelExtractionSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import { providerStatus, resolveBarcode, resolveFromLabel, resolveVivino, searchWines } from '../providers/chain.js'
import { GeminiError, isGeminiConfigured } from '../services/gemini.js'
import { extractLabel } from '../services/labelScan.js'

/** ~8 Mo de base64 ≈ 6 Mo d'image : très au-delà d'une photo redimensionnée à 1024 px. */
const MAX_IMAGE_BASE64 = 8 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

const scanSchema = z.object({
  imageBase64: z.string().min(100).max(MAX_IMAGE_BASE64),
  mimeType: z.enum(ALLOWED_MIME as [string, ...string[]]),
})

export default async function wineRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /**
   * Lecture d'une photo d'étiquette, puis résolution via la chaîne de providers.
   *
   * Limité en débit : c'est le seul endpoint qui consomme du quota Gemini hors sommelier.
   */
  app.post('/scan', {
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    handler: async (req, reply) => {
      if (!isGeminiConfigured()) {
        return reply.code(503).send({
          error: 'La lecture d’étiquette n’est pas configurée (GEMINI_API_KEY manquante).',
          fallback: 'manual',
        })
      }

      const parsed = scanSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Image invalide', issues: parsed.error.issues })
      }

      try {
        const { extraction } = await extractLabel(parsed.data.imageBase64, parsed.data.mimeType)
        const result = await resolveFromLabel(extraction)
        return { extraction, ...result }
      } catch (error) {
        if (error instanceof GeminiError) {
          // L'utilisateur doit pouvoir enchaîner en saisie manuelle, pas rester bloqué.
          return reply.code(502).send({ error: error.message, fallback: 'manual' })
        }
        throw error
      }
    },
  })

  /** Résolution par code-barres EAN lu côté navigateur (contre-étiquette). */
  app.post('/barcode', async (req, reply) => {
    const parsed = z.object({ barcode: z.string().regex(/^\d{8,14}$/) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Code-barres invalide' })

    return resolveBarcode(parsed.data.barcode)
  })

  /** Recherche texte manuelle — la troisième voie de saisie, toujours disponible. */
  app.get('/search', async (req, reply) => {
    const parsed = z.object({ q: z.string().min(2).max(120) }).safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Requête trop courte' })

    return { candidates: await searchWines(parsed.data.q), providerStatus: providerStatus() }
  })

  /** Fiche complète d'un candidat retenu par l'utilisateur. */
  app.get('/vivino/:wineId', async (req, reply) => {
    const { wineId } = req.params as { wineId: string }
    if (!/^\d+$/.test(wineId)) return reply.code(400).send({ error: 'Identifiant invalide' })

    const wine = await resolveVivino(wineId)
    if (!wine) return reply.code(404).send({ error: 'Fiche introuvable', providerStatus: providerStatus() })

    return { wine, providerStatus: providerStatus() }
  })

  /** Résolution à partir de champs saisis à la main, sans photo. */
  app.post('/resolve', async (req, reply) => {
    const parsed = labelExtractionSchema.partial().safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    return resolveFromLabel({
      producer: parsed.data.producer ?? null,
      cuvee: parsed.data.cuvee ?? null,
      appellation: parsed.data.appellation ?? null,
      vintage: parsed.data.vintage ?? null,
      color: parsed.data.color ?? null,
      country: parsed.data.country ?? null,
    })
  })

  app.get('/providers/status', async () => ({
    ...providerStatus(),
    gemini: { configured: isGeminiConfigured(), model: config.GEMINI_MODEL },
  }))
}
