import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { resolveCellarOwner } from './ownership.js'

function request(role: 'USER' | 'ADMIN', asUser?: unknown): FastifyRequest {
  return {
    currentUser: { id: 'user-self', email: 'self@cave.test', name: 'Self', role },
    query: asUser === undefined ? {} : { asUser },
  } as FastifyRequest
}

describe('resolveCellarOwner', () => {
  it('cible le compte connecté sans paramètre', async () => {
    await expect(resolveCellarOwner(request('USER'))).resolves.toBe('user-self')
  })

  it('refuse la cave d’un tiers à un utilisateur normal', async () => {
    await expect(resolveCellarOwner(request('USER', 'user-other'))).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('autorise un administrateur à cibler une lecture', async () => {
    await expect(resolveCellarOwner(request('ADMIN', 'user-other'))).resolves.toBe('user-other')
  })

  it('refuse un identifiant vide ou non textuel', async () => {
    await expect(resolveCellarOwner(request('ADMIN', ''))).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})
