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

class BottlePlacementError extends Error {
  constructor(
    readonly missingSlotNumbers: number[],
    readonly occupiedSlotNumbers: number[],
  ) {
    super('Emplacements indisponibles')
    this.name = 'BottlePlacementError'
  }
}

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
    const { wine, rackId, personalNote, purchasePrice, labelPhotoPath } = parsed.data
    const requestedNumbers = parsed.data.slotNumbers ?? [parsed.data.slotNumber!]

    const result = await prisma.$transaction(async (tx) => {
      const slots = await tx.slot.findMany({
        where: { rackId, number: { in: requestedNumbers } },
        include: { bottles: { where: { status: 'IN_CELLAR' } } },
      })
      const slotsByNumber = new Map(slots.map((slot) => [slot.number, slot]))
      const missingSlotNumbers = requestedNumbers.filter((number) => !slotsByNumber.has(number))
      const occupiedSlotNumbers = requestedNumbers.filter(
        (number) => (slotsByNumber.get(number)?.bottles.length ?? 0) > 0,
      )

      // Lever une erreur dans la transaction garantit qu'aucun exemplaire — et aucune
      // mise à jour de la fiche vin — ne subsiste si un seul emplacement pose problème.
      if (missingSlotNumbers.length > 0 || occupiedSlotNumbers.length > 0) {
        throw new BottlePlacementError(missingSlotNumbers, occupiedSlotNumbers)
      }

      const wineId = await upsertWine(enrichWineData(wine), tx)
      await tx.bottle.createMany({
        data: requestedNumbers.map((slotNumber) => ({
          wineId,
          slotId: slotsByNumber.get(slotNumber)!.id,
          status: 'IN_CELLAR',
          addedById: req.currentUser!.id,
          personalNote,
          purchasePrice,
          labelPhotoPath,
        })),
      })

      const createdBottles = await tx.bottle.findMany({
        where: { slotId: { in: slots.map((slot) => slot.id) }, status: 'IN_CELLAR' },
        include: {
          wine: { include: { foodTags: { include: { foodTag: true } } } },
          slot: { include: { rack: true } },
        },
      })
      if (createdBottles.length !== requestedNumbers.length) {
        throw new Error('Le lot créé est incomplet, la transaction doit être annulée.')
      }
      const bottlesBySlotId = new Map(
        createdBottles.map((bottle) => [bottle.slotId, serializeBottle(bottle)]),
      )

      return requestedNumbers.map(
        (slotNumber) => bottlesBySlotId.get(slotsByNumber.get(slotNumber)!.id)!,
      )
    }).catch((error: unknown) => {
      if (error instanceof BottlePlacementError) return error
      throw error
    })

    if (result instanceof BottlePlacementError) {
      const affected = requestedNumbers.filter(
        (number) =>
          result.missingSlotNumbers.includes(number) ||
          result.occupiedSlotNumbers.includes(number),
      )
      const singular = affected.length === 1
      const missingMessage = result.missingSlotNumbers.length
        ? result.missingSlotNumbers.length === 1
          ? `L’emplacement ${result.missingSlotNumbers[0]} n’existe pas dans ce casier.`
          : `Les emplacements ${result.missingSlotNumbers.join(', ')} n’existent pas dans ce casier.`
        : ''
      const occupiedMessage = result.occupiedSlotNumbers.length
        ? result.occupiedSlotNumbers.length === 1
          ? `L’emplacement ${result.occupiedSlotNumbers[0]} est déjà occupé.`
          : `Les emplacements ${result.occupiedSlotNumbers.join(', ')} sont déjà occupés.`
        : ''

      return reply.code(result.missingSlotNumbers.length > 0 ? 400 : 409).send({
        error: [missingMessage, occupiedMessage].filter(Boolean).join(' '),
        ...(singular ? { slotNumber: affected[0] } : {}),
        slotNumbers: affected,
        missingSlotNumbers: result.missingSlotNumbers,
        occupiedSlotNumbers: result.occupiedSlotNumbers,
      })
    }

    return reply.code(201).send({ bottle: result[0], bottles: result })
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
