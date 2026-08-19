import {
  addBottleCopiesSchema,
  createBottleSchema,
  drinkBottleSchema,
  drinkBottlesSchema,
  searchSchema,
  updateBottleSchema,
} from '@cave/shared'
import type { BottlePlacementInput, DrinkBottleInput } from '@cave/shared'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { resolveCellarOwner } from '../lib/ownership.js'
import { prisma } from '../lib/prisma.js'
import { enrichWineData } from '../providers/heuristics.js'
import { searchBottles } from '../services/search.js'
import { serializeBottle } from '../services/serialize.js'
import { drinkingWindow, upsertWine } from '../services/wines.js'

class BottlePlacementError extends Error {
  constructor(
    readonly missingSlotNumbers: number[],
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

  async function createPhysicalBottles(
    tx: Prisma.TransactionClient,
    ownerId: string,
    wineId: string,
    placements: BottlePlacementInput[],
    details: {
      personalNote?: string | null
      purchasePrice?: number | null
      labelPhotoPath?: string | null
      ownerLabel?: string | null
    } = {},
  ) {
    const slots = await tx.slot.findMany({
      where: {
        OR: placements.map((placement) => ({
          rackId: placement.rackId,
          number: placement.slotNumber,
        })),
        rack: { ownerId },
      },
    })
    const key = (rackId: string, number: number) => `${rackId}:${number}`
    const slotsByPosition = new Map(slots.map((slot) => [key(slot.rackId, slot.number), slot]))
    const missing = placements.filter(
      (placement) => !slotsByPosition.has(key(placement.rackId, placement.slotNumber)),
    )
    if (missing.length > 0) {
      throw new BottlePlacementError(missing.map((placement) => placement.slotNumber))
    }

    const ids: string[] = []
    for (const placement of placements) {
      const slot = slotsByPosition.get(key(placement.rackId, placement.slotNumber))!
      for (let index = 0; index < placement.quantity; index++) {
        const bottle = await tx.bottle.create({
          data: {
            wineId,
            slotId: slot.id,
            ownerId,
            status: 'IN_CELLAR',
            personalNote: details.personalNote,
            purchasePrice: details.purchasePrice,
            labelPhotoPath: details.labelPhotoPath,
            ownerLabel: details.ownerLabel,
          },
          select: { id: true },
        })
        ids.push(bottle.id)
      }
    }

    const created = await tx.bottle.findMany({
      where: { id: { in: ids }, ownerId },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })
    const byId = new Map(created.map((bottle) => [bottle.id, bottle]))
    return ids.map((id) => serializeBottle(byId.get(id)!))
  }

  /**
   * Ouvre un ou plusieurs exemplaires dans une seule transaction.
   *
   * Les emplacements sont copiés avant le `updateMany`, car `slotId` est ensuite détaché.
   * Le contrôle du nombre de lignes modifiées couvre le conflit concurrent entre la lecture
   * et l'écriture : lever après l'écriture force Prisma à annuler toute la transaction.
   */
  async function drinkBottles(
    ownerId: string,
    bottleIds: string[],
    tasting: DrinkBottleInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const bottles = await tx.bottle.findMany({
        where: { id: { in: bottleIds }, ownerId },
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
      const candidateSlots = orderedBottles.map((bottle) => ({
        slotId: bottle.slot!.id,
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
          ownerId,
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

      const stillOccupied = new Set(
        (
          await tx.bottle.findMany({
            where: {
              status: 'IN_CELLAR',
              slotId: { in: [...new Set(candidateSlots.map((slot) => slot.slotId))] },
            },
            select: { slotId: true },
          })
        ).flatMap((remaining) => (remaining.slotId ? [remaining.slotId] : [])),
      )
      const freedSlots = [
        ...new Map(
          candidateSlots
            .filter((slot) => !stillOccupied.has(slot.slotId))
            .map((slot) => [
              slot.slotId,
              {
                bottleId: slot.bottleId,
                slotNumber: slot.slotNumber,
                rackId: slot.rackId,
                rackName: slot.rackName,
              },
            ]),
        ).values(),
      ]

      const updated = await tx.bottle.findMany({
        where: { id: { in: bottleIds }, ownerId },
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
    return searchBottles(parsed.data, await resolveCellarOwner(req))
  })

  app.post('/', async (req, reply) => {
    const parsed = createBottleSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    const { wine, personalNote, purchasePrice, labelPhotoPath, ownerLabel } = parsed.data
    const placements = parsed.data.placements ??
      (parsed.data.slotNumbers ?? [parsed.data.slotNumber!]).map((slotNumber) => ({
        rackId: parsed.data.rackId!,
        slotNumber,
        quantity: 1,
      }))

    const result = await prisma
      .$transaction(async (tx) => {
        const wineId = await upsertWine(enrichWineData(wine), tx)
        return createPhysicalBottles(tx, req.currentUser!.id, wineId, placements, {
          personalNote,
          purchasePrice,
          labelPhotoPath,
          ownerLabel,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof BottlePlacementError) return error
        throw error
      })

    if (result instanceof BottlePlacementError) {
      const affected = result.missingSlotNumbers
      const singular = affected.length === 1
      const missingMessage = singular
        ? `L’emplacement ${affected[0]} n’existe pas dans ce casier.`
        : `Les emplacements ${affected.join(', ')} n’existent pas dans ces casiers.`

      return reply.code(404).send({
        error: missingMessage,
        ...(singular ? { slotNumber: affected[0] } : {}),
        slotNumbers: affected,
        missingSlotNumbers: result.missingSlotNumbers,
        occupiedSlotNumbers: [],
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
      return await drinkBottles(req.currentUser!.id, bottleIds, tasting)
    } catch (error) {
      if (!(error instanceof BottleDrinkConflictError)) throw error
      if (error.missingBottleIds.length > 0) {
        return reply.code(404).send({ error: 'Bouteille introuvable' })
      }
      return reply.code(409).send({
        error: error.message,
        bottleIds,
        conflictingBottleIds: error.bottleIds,
      })
    }
  })

  /** Ajoute des exemplaires depuis une fiche déjà détenue, sans solliciter de provider. */
  app.post('/:id/copies', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = addBottleCopiesSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const source = await prisma.bottle.findFirst({
      where: { id, ownerId: req.currentUser!.id },
      select: {
        wineId: true,
        personalNote: true,
        purchasePrice: true,
        labelPhotoPath: true,
        ownerLabel: true,
      },
    })
    if (!source) return reply.code(404).send({ error: 'Bouteille introuvable' })

    try {
      const bottles = await prisma.$transaction((tx) =>
        createPhysicalBottles(
          tx,
          req.currentUser!.id,
          source.wineId,
          parsed.data.placements,
          source,
        ),
      )
      return reply.code(201).send({ bottle: bottles[0], bottles })
    } catch (error) {
      if (!(error instanceof BottlePlacementError)) throw error
      return reply.code(404).send({
        error: `Emplacement(s) introuvable(s) : ${error.missingSlotNumbers.join(', ')}.`,
        missingSlotNumbers: error.missingSlotNumbers,
      })
    }
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ownerId = await resolveCellarOwner(req)
    const bottle = await prisma.bottle.findFirst({
      where: { id, ownerId },
      include: {
        wine: { include: { foodTags: { include: { foodTag: true } } } },
        slot: { include: { rack: true } },
      },
    })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    const activeBottles = await prisma.bottle.findMany({
      where: { wineId: bottle.wineId, status: 'IN_CELLAR', ownerId },
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

    const ownerId = req.currentUser!.id
    const bottle = await prisma.bottle.findFirst({
      where: { id, ownerId },
      include: { slot: true },
    })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    if (parsed.data.personalRating !== undefined && bottle.status !== 'DRUNK') {
      return reply.code(409).send({
        error: 'La note de dégustation ne peut être modifiée qu’après ouverture.',
      })
    }

    let slotId = bottle.slotId

    // Déplacement vers un autre emplacement de la même cave, occupé ou non.
    if (parsed.data.slotNumber != null || parsed.data.rackId) {
      const rackId = parsed.data.rackId ?? bottle.slot?.rackId
      const number = parsed.data.slotNumber ?? bottle.slot?.number
      if (!rackId || number == null) {
        return reply.code(400).send({ error: 'Casier ou emplacement manquant' })
      }

      const target = await prisma.slot.findFirst({
        where: { rackId, number, rack: { ownerId } },
      })
      if (!target) return reply.code(404).send({ error: 'Emplacement introuvable' })
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
        ...(parsed.data.ownerLabel !== undefined ? { ownerLabel: parsed.data.ownerLabel } : {}),
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
      const result = await drinkBottles(req.currentUser!.id, [id], parsed.data)
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
    const bottle = await prisma.bottle.findFirst({
      where: { id, ownerId: req.currentUser!.id },
    })
    if (!bottle) return reply.code(404).send({ error: 'Bouteille introuvable' })

    await prisma.bottle.delete({ where: { id } })
    return { ok: true }
  })
}
