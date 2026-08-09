import {
  createBottleSchema,
  drinkBottleSchema,
  searchSchema,
  updateBottleSchema,
} from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { enrichWineData } from '../providers/heuristics.js'
import { searchBottles } from '../services/search.js'
import { serializeBottle } from '../services/serialize.js'
import { drinkingWindow, upsertWine } from '../services/wines.js'

export default async function bottleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.post('/search', async (req, reply) => {
    const parsed = searchSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    return searchBottles(parsed.data)
  })

  app.post('/', async (req, reply) => {
    const parsed = createBottleSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    const { wine, rackId, slotNumber, personalNote, purchasePrice, labelPhotoPath } = parsed.data

    const slot = await prisma.slot.findUnique({
      where: { rackId_number: { rackId, number: slotNumber } },
      include: { bottles: { where: { status: 'IN_CELLAR' } } },
    })

    if (!slot) {
      return reply.code(400).send({ error: `L’emplacement ${slotNumber} n’existe pas dans ce casier.` })
    }
    if (slot.bottles.length > 0) {
      return reply
        .code(409)
        .send({ error: `L’emplacement ${slotNumber} est déjà occupé.`, slotNumber })
    }

    const wineId = await upsertWine(enrichWineData(wine))

    const bottle = await prisma.bottle.create({
      data: {
        wineId,
        slotId: slot.id,
        status: 'IN_CELLAR',
        addedById: req.currentUser!.id,
        personalNote,
        purchasePrice,
        labelPhotoPath,
      },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })

    return reply.code(201).send({ bottle: serializeBottle(bottle) })
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const bottle = await prisma.bottle.findUnique({
      where: { id },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    const serialized = serializeBottle(bottle)
    return { bottle: serialized, drinkingWindow: drinkingWindow(serialized.wine) }
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateBottleSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const bottle = await prisma.bottle.findUnique({ where: { id }, include: { slot: true } })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    let slotId = bottle.slotId

    // Déplacement vers un autre emplacement : il doit exister et être libre.
    if (parsed.data.slotNumber != null || parsed.data.rackId) {
      const rackId = parsed.data.rackId ?? bottle.slot?.rackId
      const number = parsed.data.slotNumber ?? bottle.slot?.number
      if (!rackId || number == null) {
        return reply.code(400).send({ error: 'Casier ou emplacement manquant' })
      }

      const target = await prisma.slot.findUnique({
        where: { rackId_number: { rackId, number } },
        include: { bottles: { where: { status: 'IN_CELLAR', NOT: { id } } } },
      })
      if (!target) return reply.code(400).send({ error: `L’emplacement ${number} n’existe pas.` })
      if (target.bottles.length > 0) {
        return reply.code(409).send({ error: `L’emplacement ${number} est déjà occupé.` })
      }
      slotId = target.id
    }

    const updated = await prisma.bottle.update({
      where: { id },
      data: {
        slotId,
        ...(parsed.data.personalNote !== undefined ? { personalNote: parsed.data.personalNote } : {}),
        ...(parsed.data.purchasePrice !== undefined
          ? { purchasePrice: parsed.data.purchasePrice }
          : {}),
      },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })

    return { bottle: serializeBottle(updated) }
  })

  /** Marque une bouteille comme bue : l'emplacement se libère, la dégustation est archivée. */
  app.post('/:id/drink', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = drinkBottleSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const bottle = await prisma.bottle.findUnique({ where: { id } })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })
    if (bottle.status === 'DRUNK') {
      return reply.code(409).send({ error: 'Cette bouteille est déjà marquée comme bue.' })
    }

    const updated = await prisma.bottle.update({
      where: { id },
      data: {
        status: 'DRUNK',
        // On détache l'emplacement pour le libérer, mais on garde la bouteille en base :
        // l'historique de dégustation est justement ce que Vivino faisait payer.
        slotId: null,
        drunkAt: parsed.data.drunkAt ? new Date(parsed.data.drunkAt) : new Date(),
        personalRating: parsed.data.personalRating,
        ...(parsed.data.personalNote !== null ? { personalNote: parsed.data.personalNote } : {}),
      },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })

    return { bottle: serializeBottle(updated) }
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const bottle = await prisma.bottle.findUnique({ where: { id } })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    await prisma.bottle.delete({ where: { id } })
    return { ok: true }
  })
}
