import { type SearchInput, matchFoodTags } from '@cave/shared'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { serializeBottle } from './serialize.js'

/**
 * Recherche dans la cave.
 *
 * Tout se fait en SQL, sans IA : c'est instantané et gratuit, et c'est ce qui pilote
 * l'allumage des emplacements dans la vue casier. Le sommelier IA est un complément,
 * pas le chemin principal.
 */

type BottleWhere = NonNullable<Parameters<typeof prisma.bottle.findMany>[0]>['where']

/**
 * Interprète le texte libre.
 *
 * Un même terme peut désigner un accord ou un nom : « poisson » doit allumer les vins
 * accordés au poisson, tandis que « Margaux » doit trouver l'appellation. On construit donc
 * un OR entre les deux interprétations plutôt que de choisir à la place de l'utilisateur.
 */
function buildTextFilter(q: string): NonNullable<BottleWhere>['OR'] {
  const term = q.trim()
  if (!term) return undefined

  const foodSlugs = matchFoodTags(term)

  const clauses: NonNullable<NonNullable<BottleWhere>['OR']> = [
    { wine: { name: { contains: term } } },
    { wine: { producer: { contains: term } } },
    { wine: { region: { contains: term } } },
    { wine: { appellation: { contains: term } } },
    { wine: { country: { contains: term } } },
    { wine: { grapes: { contains: term } } },
    { wine: { flavors: { contains: term } } },
    { personalNote: { contains: term } },
  ]

  if (foodSlugs.length > 0) {
    clauses.push({ wine: { foodTags: { some: { foodTag: { slug: { in: foodSlugs } } } } } })
  }

  return clauses
}

export interface SearchOutcome {
  bottles: ReturnType<typeof serializeBottle>[]
  /** Emplacements à allumer dans la vue casier, groupés par casier. */
  matchedSlots: { rackId: string; slotNumber: number }[]
  total: number
  /** Slugs d'accords reconnus dans le texte libre — affichés comme facettes actives. */
  interpretedFoodTags: string[]
}

export async function searchBottles(input: SearchInput, ownerId: string): Promise<SearchOutcome> {
  const and: NonNullable<BottleWhere>[] = [{ status: input.status }, { ownerId }]

  if (input.q) {
    const or = buildTextFilter(input.q)
    if (or) and.push({ OR: or })
  }

  if (input.colors?.length) and.push({ wine: { color: { in: input.colors } } })
  if (input.regions?.length) {
    and.push({ OR: input.regions.map((r) => ({ wine: { region: { contains: r } } })) })
  }
  if (input.minRating != null) and.push({ wine: { vivinoRating: { gte: input.minRating } } })
  if (input.vintageMin != null) and.push({ wine: { vintage: { gte: input.vintageMin } } })
  if (input.vintageMax != null) and.push({ wine: { vintage: { lte: input.vintageMax } } })
  if (input.priceMax != null) and.push({ wine: { priceAvg: { lte: input.priceMax } } })
  if (input.rackId) and.push({ slot: { rackId: input.rackId } })

  if (input.foodTags?.length) {
    // ET entre facettes : cocher « bœuf » et « fromage » cherche un vin qui va sur les deux.
    for (const slug of input.foodTags) {
      and.push({ wine: { foodTags: { some: { foodTag: { slug } } } } } as NonNullable<BottleWhere>)
    }
  }

  if (input.flavors?.length) {
    and.push({ OR: input.flavors.map((f) => ({ wine: { flavors: { contains: f } } })) })
  }

  const bottles = await prisma.bottle.findMany({
    where: { AND: and },
    take: input.limit,
    include: {
      wine: { include: { foodTags: { include: { foodTag: true } } } },
      slot: { include: { rack: true } },
    },
    orderBy: buildOrderBy(input.sort),
  })

  // Le profil gustatif est stocké en JSON sérialisé : SQLite ne sait pas le filtrer en SQL,
  // donc on affine en mémoire. Le volume d'une cave familiale rend ça sans conséquence.
  const filtered = input.structure
    ? bottles.filter((bottle) => matchesStructure(bottle.wine.structure, input.structure!))
    : bottles

  return {
    bottles: filtered.map(serializeBottle),
    matchedSlots: [
      ...new Map(
        filtered
          .filter((b) => b.slot)
          .map((b) => [
            `${b.slot!.rackId}:${b.slot!.number}`,
            { rackId: b.slot!.rackId, slotNumber: b.slot!.number },
          ]),
      ).values(),
    ],
    total: filtered.length,
    interpretedFoodTags: input.q ? matchFoodTags(input.q) : [],
  }
}

function matchesStructure(
  raw: string,
  bounds: NonNullable<SearchInput['structure']>,
): boolean {
  let structure: Record<string, number | null>
  try {
    structure = JSON.parse(raw) as Record<string, number | null>
  } catch {
    return false
  }

  for (const [axis, range] of Object.entries(bounds)) {
    if (!range) continue
    const [min, max] = range
    const value = structure[axis]
    // Un vin dont l'axe est inconnu est exclu d'un filtre explicite sur cet axe : mieux vaut
    // ne pas le proposer que de le proposer à tort.
    if (value == null || value < min || value > max) return false
  }
  return true
}

function buildOrderBy(sort: SearchInput['sort']): Prisma.BottleOrderByWithRelationInput[] {
  switch (sort) {
    case 'rating':
      return [{ wine: { vivinoRating: 'desc' } }, { wine: { name: 'asc' } }]
    case 'vintage':
      return [{ wine: { vintage: 'desc' } }, { wine: { name: 'asc' } }]
    case 'added':
      return [{ addedAt: 'desc' }]
    case 'name':
      return [{ wine: { name: 'asc' } }]
    default:
      return [{ slot: { number: 'asc' } }, { addedAt: 'desc' }]
  }
}
