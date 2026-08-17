import {
  createBottleSchema,
  drinkBottleSchema,
  drinkBottlesSchema,
  searchSchema,
  updateBottleSchema,
} from '@cave/shared'
import type { DrinkBottleInput } from '@cave/shared'
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

class BottleDrinkConflictError extends Error {
  constructor(
    readonly bottleIds: string[],
    readonly missingBottleIds: string[] = [],
  ) {
    super('Certaines bouteilles ne peuvent plus être ouvertes.')
    this.name = 'BottleDrinkConflictError'
  }
}

export default async function bottleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /**
   * Ouvre un ou plusieurs exemplaires dans une seule transaction.
   *
   * Les emplacements sont copiés avant le `updateMany`, car `slotId` est ensuite détaché.
   * Le contrôle du nombre de lignes modifiées couvre le conflit concurrent entre la lecture
   * et l'écriture : lever après l'écriture force Prisma à annuler toute la transaction.
   */
  async function drinkBottles(bottleIds: string[], tasting: DrinkBottleInput) {
    return prisma.$transaction(async (tx) => {
      const bottles = await tx.bottle.findMany({
        where: { id: { in: bottleIds } },
        include: {
          wine: { include: { foodTags: { include: { foodTag: true } } } },
          slot: { include: { rack: true } },
        },
      })
      const bottlesById = new Map(bottles.map((bottle) => [bottle.id, bottle]))
      const missingBottleIds = bottleIds.filter((id) => !bottlesById.has(id))
      const orderedBottles = bottleIds.flatMap((id) => {
        const bottle = bottlesById.get(id)
        return bottle ? [bottle] : []
      })
      const wineIds = new Set(orderedBottles.map((bottle) => bottle.wineId))
      const invalidBottleIds = orderedBottles
        .filter((bottle) => bottle.status !== 'IN_CELLAR' || bottle.slot === null)
        .map((bottle) => bottle.id)

      if (missingBottleIds.length > 0 || wineIds.size !== 1 || invalidBottleIds.length > 0) {
        const conflictingBottleIds =
          wineIds.size !== 1
            ? bottleIds
            : [...new Set([...missingBottleIds, ...invalidBottleIds])]
        throw new BottleDrinkConflictError(
          conflictingBottleIds,
          missingBottleIds,
        )
      }

      const wineId = orderedBottles[0]!.wineId
      const freedSlots = orderedBottles.map((bottle) => ({
        bottleId: bottle.id,
        slotNumber: bottle.slot!.number,
        rackId: bottle.slot!.rackId,
        rackName: bottle.slot!.rack.name,
      }))
      const result = await tx.bottle.updateMany({
        where: {
          OR: orderedBottles.map((bottle) => ({ id: bottle.id, slotId: bottle.slotId })),
          status: 'IN_CELLAR',
          wineId,
        },
        data: {
          status: 'DRUNK',
          slotId: null,
          drunkAt: tasting.drunkAt ? new Date(tasting.drunkAt) : new Date(),
          personalRating: tasting.personalRating,
          personalNote: tasting.personalNote,
        },
      })
      if (result.count !== bottleIds.length) {
        throw new BottleDrinkConflictError(bottleIds)
      }

      const updated = await tx.bottle.findMany({
        where: { id: { in: bottleIds } },
        include: {
          wine: { include: { foodTags: { include: { foodTag: true } } } },
          slot: { include: { rack: true } },
        },
      })
      const updatedById = new Map(updated.map((bottle) => [bottle.id, bottle]))
      return {
        bottles: bottleIds.map((id) => serializeBottle(updatedById.get(id)!)),
        freedSlots,
      }
    })
  }

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

  /** Contrat atomique pour l'ouverture d'un ou plusieurs exemplaires du même vin. */
  app.post('/drink', async (req, reply) => {
    const parsed = drinkBottlesSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    const { bottleIds, ...tasting } = parsed.data

    try {
      return await drinkBottles(bottleIds, tasting)
    } catch (error) {
      if (!(error instanceof BottleDrinkConflictError)) throw error
      return reply.code(409).send({
        error: error.message,
        bottleIds,
        conflictingBottleIds: error.bottleIds,
      })
    }
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

    const activeBottles = await prisma.bottle.findMany({
      where: { wineId: bottle.wineId, status: 'IN_CELLAR' },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })
    activeBottles.sort((a, b) => {
      if (a.slot === null && b.slot !== null) return 1
      if (a.slot !== null && b.slot === null) return -1
      if (a.slot && b.slot) {
        const byRackPosition = a.slot.rack.position - b.slot.rack.position
        if (byRackPosition !== 0) return byRackPosition
        const byRackCreation = a.slot.rack.createdAt.getTime() - b.slot.rack.createdAt.getTime()
        if (byRackCreation !== 0) return byRackCreation
        const bySlot = a.slot.number - b.slot.number
        if (bySlot !== 0) return bySlot
      }
      return a.id.localeCompare(b.id)
    })

    const serialized = serializeBottle(bottle)
    return {
      bottle: serialized,
      activeBottles: activeBottles.map(serializeBottle),
      drinkingWindow: drinkingWindow(serialized.wine),
    }
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateBottleSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const bottle = await prisma.bottle.findUnique({ where: { id }, include: { slot: true } })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    if (parsed.data.personalRating !== undefined && bottle.status !== 'DRUNK') {
      return reply.code(409).send({
        error: 'La note de dégustation ne peut être modifiée qu’après ouverture.',
      })
    }

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
        ...(parsed.data.personalRating !== undefined
          ? { personalRating: parsed.data.personalRating }
          : {}),
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

    try {
      const result = await drinkBottles([id], parsed.data)
      return { bottle: result.bottles[0] }
    } catch (error) {
      if (!(error instanceof BottleDrinkConflictError)) throw error
      if (error.missingBottleIds.includes(id)) {
        return reply.code(404).send({ error: 'Bouteille introuvable' })
      }
      return reply.code(409).send({ error: 'Cette bouteille est déjà marquée comme bue.' })
    }
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const bottle = await prisma.bottle.findUnique({ where: { id } })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    await prisma.bottle.delete({ where: { id } })
    return { ok: true }
  })
}
