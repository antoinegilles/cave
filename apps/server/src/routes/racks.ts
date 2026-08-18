import {
  MAX_RACK_SLOTS,
  MAX_SLOT_NUMBER,
  createRackSchema,
  renumberRackSchema,
  updateRackSchema,
  updateSlotNumberSchema,
} from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { resolveCellarOwner } from '../lib/ownership.js'
import { prisma } from '../lib/prisma.js'
import { generateSlots, reconcileSlots, renumberByRow } from '../lib/slots.js'
import { serializeBottle } from '../services/serialize.js'

export default async function rackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /** Renvoie les casiers avec leurs emplacements et la bouteille présente dans chacun. */
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
              // Défense en profondeur pour les bases issues de l'ancien modèle partagé.
              where: { status: 'IN_CELLAR', ownerId },
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
          bottles: slot.bottles.map(serializeBottle),
          // Compatibilité d'un ancien client PWA pendant le déploiement coordonné.
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
    const { name, rows, cols, numbering, startNumber } = parsed.data

    const ownerId = req.currentUser!.id
    const count = await prisma.rack.count({ where: { ownerId } })
    const rack = await prisma.rack.create({
      data: {
        ownerId,
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

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateRackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const rack = await prisma.rack.findFirst({ where: { id, ownerId: req.currentUser!.id } })
    if (!rack) return reply.code(404).send({ error: 'Casier introuvable' })

    const next = {
      rows: parsed.data.rows ?? rack.rows,
      cols: parsed.data.cols ?? rack.cols,
      numbering: (parsed.data.numbering ?? rack.numbering) as 'ROW_MAJOR' | 'COL_MAJOR',
      startNumber: parsed.data.startNumber ?? rack.startNumber,
    }

    if (next.rows * next.cols > MAX_RACK_SLOTS) {
      return reply.code(400).send({
        error: `Un casier ne peut pas dépasser ${MAX_RACK_SLOTS.toLocaleString('fr-FR')} emplacements.`,
      })
    }
    if (next.startNumber + next.rows * next.cols - 1 > MAX_SLOT_NUMBER) {
      return reply.code(400).send({
        error: `La numérotation dépasserait ${MAX_SLOT_NUMBER.toLocaleString('fr-FR')}.`,
      })
    }

    const resized = next.rows !== rack.rows || next.cols !== rack.cols
    // Toucher à la numérotation est un geste explicite de renumérotation complète : c'est
    // le seul cas où l'on accepte d'écraser les numéros personnalisés.
    const renumbered =
      next.numbering !== rack.numbering || next.startNumber !== rack.startNumber

    if (!resized && !renumbered) {
      await prisma.rack.update({ where: { id }, data: { name: parsed.data.name ?? rack.name } })
      return { ok: true, relocated: 0 }
    }

    const existing = await prisma.slot.findMany({
      where: { rackId: id },
      select: { id: true, number: true, row: true, col: true },
    })

    // Redimensionner ne doit jamais faire disparaître silencieusement une bouteille rangée
    // dans un emplacement qui n'existe plus. On refuse tant que ces bouteilles n'ont pas
    // été déplacées, plutôt que de les détacher sans prévenir. Le test porte sur les
    // **positions** : c'est la case physique qui disparaît, pas son étiquette.
    const generatedByPosition = new Map(
      generateSlots(next.rows, next.cols, next.numbering, next.startNumber).map((slot) => [
        `${slot.row}:${slot.col}`,
        slot.number,
      ]),
    )
    const slotsToReconcile = renumbered
      ? existing.map((slot) => ({
          ...slot,
          number: generatedByPosition.get(`${slot.row}:${slot.col}`) ?? slot.number,
        }))
      : existing

    let reconciliation
    try {
      reconciliation = reconcileSlots(
        slotsToReconcile,
        next.rows,
        next.cols,
        next.numbering,
        next.startNumber,
      )
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message })
    }
    const { toCreate, toDelete } = reconciliation

    const orphaned = await prisma.bottle.findMany({
      where: {
        status: 'IN_CELLAR',
        slotId: { in: toDelete.map((s) => s.id) },
      },
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
      if (toDelete.length > 0) {
        await tx.slot.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } })
      }

      if (renumbered) {
        // Renumérotation demandée : la suite générée reprend la main sur tout le casier.
        // On passe par des numéros négatifs temporaires car `@@unique([rackId, number])`
        // rejetterait les collisions transitoires d'une réattribution en place.
        const kept = await tx.slot.findMany({
          where: { rackId: id },
          select: { id: true, row: true, col: true },
        })
        for (const [index, slot] of kept.entries()) {
          await tx.slot.update({ where: { id: slot.id }, data: { number: -1 - index } })
        }
        for (const slot of kept) {
          const number = generatedByPosition.get(`${slot.row}:${slot.col}`)
          if (number !== undefined) {
            await tx.slot.update({ where: { id: slot.id }, data: { number } })
          }
        }
      }

      if (toCreate.length > 0) {
        const positionsToCreate = new Set(toCreate.map((slot) => `${slot.row}:${slot.col}`))
        const createdSlots = renumbered
          ? generateSlots(next.rows, next.cols, next.numbering, next.startNumber).filter(
              (generated) => positionsToCreate.has(`${generated.row}:${generated.col}`),
            )
          : toCreate
        await tx.slot.createMany({ data: createdSlots.map((s) => ({ ...s, rackId: id })) })
      }
    })

    return { ok: true }
  })

  app.patch('/:id/renumber', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = renumberRackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const rack = await prisma.rack.findFirst({ where: { id, ownerId: req.currentUser!.id } })
    if (!rack) return reply.code(404).send({ error: 'Casier introuvable' })

    const slots = await prisma.slot.findMany({
      where: { rackId: id },
      select: { id: true, number: true, row: true, col: true },
    })

    let numbered
    try {
      numbered = renumberByRow(
        slots,
        rack.rows,
        rack.numbering as 'ROW_MAJOR' | 'COL_MAJOR',
        parsed.data.startNumbers,
      )
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message })
    }

    await prisma.$transaction(async (tx) => {
      for (const [index, slot] of numbered.entries()) {
        await tx.slot.update({ where: { id: slot.id }, data: { number: -1 - index } })
      }
      for (const slot of numbered) {
        await tx.slot.update({ where: { id: slot.id }, data: { number: slot.number } })
      }
      await tx.rack.update({
        where: { id },
        data: { startNumber: parsed.data.startNumbers[0] ?? rack.startNumber },
      })
    })

    return { ok: true }
  })

  /**
   * Renumérote un emplacement.
   *
   * Les caves réelles sont mal étiquetées : six alvéoles numérotées 1, 2, 3, 100, 5, 6 est
   * un cas légitime. Le numéro est une étiquette libre, seule l'unicité dans le casier est
   * imposée — par la contrainte `@@unique([rackId, number])`, qu'on laisse parler.
   */
  app.patch('/:rackId/slots/:slotId', async (req, reply) => {
    const { rackId, slotId } = req.params as { rackId: string; slotId: string }
    const parsed = updateSlotNumberSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const slot = await prisma.slot.findFirst({
      where: { id: slotId, rackId, rack: { ownerId: req.currentUser!.id } },
    })
    if (!slot) return reply.code(404).send({ error: 'Emplacement introuvable' })

    try {
      const updated = await prisma.slot.update({
        where: { id: slotId },
        data: { number: parsed.data.number },
      })
      return { slot: { id: updated.id, number: updated.number, row: updated.row, col: updated.col } }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return reply
          .code(409)
          .send({ error: `Le numéro ${parsed.data.number} est déjà utilisé dans ce casier.` })
      }
      throw error
    }
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
