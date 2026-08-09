import { createRackSchema, updateRackSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { generateSlots } from '../lib/slots.js'
import { serializeBottle } from '../services/serialize.js'

export default async function rackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /** Renvoie les casiers avec leurs emplacements et la bouteille présente dans chacun. */
  app.get('/', async () => {
    const racks = await prisma.rack.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        slots: {
          orderBy: { number: 'asc' },
          include: {
            bottles: {
              where: { status: 'IN_CELLAR' },
              include: {
                wine: { include: { foodTags: { include: { foodTag: true } } } },
                // Sans cette relation, `serializeBottle` renvoyait `slotNumber: null` et la
                // vue liste affichait « n° – ». Le plan du casier, lui, n'utilise pas ce
                // champ (il lit `slot.number` directement), d'où un bug longtemps invisible.
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
          bottle: slot.bottles[0] ? serializeBottle(slot.bottles[0]) : null,
        })),
      })),
    }
  })

  app.post('/', { preHandler: app.requireAdmin }, async (req, reply) => {
    const parsed = createRackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }
    const { name, rows, cols, numbering, startNumber } = parsed.data

    const count = await prisma.rack.count()
    const rack = await prisma.rack.create({
      data: {
        name,
        rows,
        cols,
        numbering,
        startNumber,
        position: count,
        slots: { create: generateSlots(rows, cols, numbering, startNumber) },
      },
    })

    return reply.code(201).send({ rack: { id: rack.id, name: rack.name } })
  })

  app.patch('/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateRackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const rack = await prisma.rack.findUnique({ where: { id } })
    if (!rack) return reply.code(404).send({ error: 'Casier introuvable' })

    const next = {
      rows: parsed.data.rows ?? rack.rows,
      cols: parsed.data.cols ?? rack.cols,
      numbering: (parsed.data.numbering ?? rack.numbering) as 'ROW_MAJOR' | 'COL_MAJOR',
      startNumber: parsed.data.startNumber ?? rack.startNumber,
    }

    const layoutChanged =
      next.rows !== rack.rows ||
      next.cols !== rack.cols ||
      next.numbering !== rack.numbering ||
      next.startNumber !== rack.startNumber

    if (!layoutChanged) {
      await prisma.rack.update({ where: { id }, data: { name: parsed.data.name ?? rack.name } })
      return { ok: true, relocated: 0 }
    }

    // Redimensionner ne doit jamais faire disparaître silencieusement une bouteille rangée
    // dans un emplacement qui n'existe plus. On refuse tant que ces bouteilles n'ont pas
    // été déplacées, plutôt que de les détacher sans prévenir.
    const target = generateSlots(next.rows, next.cols, next.numbering, next.startNumber)
    const targetNumbers = new Set(target.map((s) => s.number))

    const orphaned = await prisma.bottle.findMany({
      where: { status: 'IN_CELLAR', slot: { rackId: id, number: { notIn: [...targetNumbers] } } },
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
      await tx.rack.update({
        where: { id },
        data: { name: parsed.data.name ?? rack.name, ...next },
      })
      // Les slots vides hors nouvelle grille sont supprimés, les manquants créés.
      await tx.slot.deleteMany({ where: { rackId: id, number: { notIn: [...targetNumbers] } } })
      const existing = await tx.slot.findMany({ where: { rackId: id }, select: { number: true } })
      const existingNumbers = new Set(existing.map((s) => s.number))
      const toCreate = target.filter((s) => !existingNumbers.has(s.number))
      if (toCreate.length > 0) {
        await tx.slot.createMany({ data: toCreate.map((s) => ({ ...s, rackId: id })) })
      }
      // Les positions row/col peuvent avoir changé même à numéro constant.
      for (const slot of target) {
        await tx.slot.updateMany({
          where: { rackId: id, number: slot.number },
          data: { row: slot.row, col: slot.col },
        })
      }
    })

    return { ok: true }
  })

  app.delete('/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }

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
