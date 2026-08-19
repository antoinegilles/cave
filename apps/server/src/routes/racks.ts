import { createRackSchema, updateRackSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { resolveCellarOwner } from '../lib/ownership.js'
import { prisma } from '../lib/prisma.js'
import { rangeGeometry, rangeSlots, reconcileRange } from '../lib/slots.js'
import { serializeBottle } from '../services/serialize.js'

export default async function rackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /** Renvoie les casiers avec leurs emplacements et les bouteilles présentes dans chacun. */
  app.get('/', async (req) => {
    const ownerId = await resolveCellarOwner(req)
    const racks = await prisma.rack.findMany({
      where: { ownerId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        slots: {
          orderBy: { number: 'asc' },
          include: {
            bottles: {
              where: { status: 'IN_CELLAR', ownerId },
              include: {
                wine: { include: { foodTags: { include: { foodTag: true } } } },
                slot: { include: { rack: true } },
              },
            },
          },
        },
      },
    })

    return {
      racks: racks.map((rack) => ({
        id: rack.id,
        name: rack.name,
        rows: rack.rows,
        cols: rack.cols,
        numbering: rack.numbering,
        startNumber: rack.startNumber,
        slots: rack.slots.map((slot) => ({
          id: slot.id,
          number: slot.number,
          row: slot.row,
          col: slot.col,
          bottles: slot.bottles.map(serializeBottle),
          // Compatibilité d'un ancien client PWA pendant un déploiement coordonné.
          bottle: slot.bottles[0] ? serializeBottle(slot.bottles[0]) : null,
        })),
      })),
    }
  })

  app.post('/', async (req, reply) => {
    const parsed = createRackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    const { name, firstNumber, lastNumber } = parsed.data

    const ownerId = req.currentUser!.id
    const position = await prisma.rack.count({ where: { ownerId } })
    const rack = await prisma.rack.create({
      data: {
        ownerId,
        name,
        ...rangeGeometry(firstNumber, lastNumber),
        numbering: 'ROW_MAJOR',
        position,
        slots: { create: rangeSlots(firstNumber, lastNumber) },
      },
    })

    return reply.code(201).send({ rack: { id: rack.id, name: rack.name } })
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateRackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    const { name, firstNumber, lastNumber } = parsed.data

    const rack = await prisma.rack.findFirst({ where: { id, ownerId: req.currentUser!.id } })
    if (!rack) return reply.code(404).send({ error: 'Casier introuvable' })

    const existing = await prisma.slot.findMany({
      where: { rackId: id },
      select: { id: true, number: true, row: true, col: true },
    })

    const { toCreate, toDelete, toMove } = reconcileRange(existing, firstNumber, lastNumber)

    // Resserrer l'intervalle ne doit jamais faire disparaître silencieusement une bouteille :
    // on refuse tant que les emplacements sur le départ n'ont pas été vidés.
    const orphaned = await prisma.bottle.findMany({
      where: { status: 'IN_CELLAR', slotId: { in: toDelete.map((s) => s.id) } },
      include: { slot: true, wine: { select: { name: true } } },
    })
    if (orphaned.length > 0) {
      return reply.code(409).send({
        error: 'Des bouteilles occupent des emplacements qui disparaîtraient',
        bottles: orphaned.map((b) => ({
          id: b.id,
          slotNumber: b.slot?.number ?? null,
          label: b.wine.name,
        })),
      })
    }

    await prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.slot.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } })
      }

      // Le glissement des positions forme une permutation : on gare d'abord les emplacements
      // déplacés sur des positions temporaires distinctes, sinon `@@unique([rackId,row,col])`
      // rejetterait une collision transitoire. Les numéros, eux, ne changent pas.
      if (toMove.length > 0) {
        for (const [index, move] of toMove.entries()) {
          await tx.slot.update({ where: { id: move.id }, data: { row: -1 - index, col: 0 } })
        }
        for (const move of toMove) {
          await tx.slot.update({ where: { id: move.id }, data: { row: move.row, col: move.col } })
        }
      }

      if (toCreate.length > 0) {
        await tx.slot.createMany({ data: toCreate.map((s) => ({ ...s, rackId: id })) })
      }

      await tx.rack.update({
        where: { id },
        data: { name, ...rangeGeometry(firstNumber, lastNumber) },
      })
    })

    return { ok: true }
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const rack = await prisma.rack.findFirst({ where: { id, ownerId: req.currentUser!.id } })
    if (!rack) return reply.code(404).send({ error: 'Casier introuvable' })

    const occupied = await prisma.bottle.count({
      where: { status: 'IN_CELLAR', slot: { rackId: id } },
    })
    if (occupied > 0) {
      return reply
        .code(409)
        .send({ error: `Ce casier contient encore ${occupied} bouteille(s). Videz-le d'abord.` })
    }

    await prisma.rack.delete({ where: { id } })
    return { ok: true }
  })
}
