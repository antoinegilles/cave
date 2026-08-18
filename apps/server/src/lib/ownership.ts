import type { FastifyRequest } from 'fastify'

class CellarOwnerError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'CellarOwnerError'
  }
}

/**
 * Propriétaire visé par une lecture : soi-même, ou un tiers pour un administrateur.
 * Les écritures ne doivent jamais appeler cette fonction : elles utilisent `currentUser.id`.
 */
export async function resolveCellarOwner(req: FastifyRequest): Promise<string> {
  const query = (req.query ?? {}) as { asUser?: unknown }
  if (query.asUser === undefined) return req.currentUser!.id
  if (typeof query.asUser !== 'string' || query.asUser.trim() === '') {
    throw new CellarOwnerError(400, 'Utilisateur consulté invalide')
  }
  if (req.currentUser?.role !== 'ADMIN') {
    throw new CellarOwnerError(403, 'La consultation d’une autre cave est réservée aux administrateurs')
  }

  return query.asUser
}
