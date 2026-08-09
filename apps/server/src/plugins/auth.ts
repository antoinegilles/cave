import { createHash, randomBytes } from 'node:crypto'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { config, isProd } from '../config.js'
import { prisma } from '../lib/prisma.js'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Exige un utilisateur authentifié. À passer en `preHandler`. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    /** Exige le rôle ADMIN. */
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    issueSession: (userId: string, userAgent?: string) => Promise<string>
    revokeSession: (refreshToken: string) => Promise<void>
  }
  interface FastifyRequest {
    currentUser?: AuthUser
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string }
    user: { sub: string; role: string }
  }
}

export const REFRESH_COOKIE = 'cave_rt'

/** Les refresh tokens sont stockés hashés : une fuite de la base ne donne pas de session valide. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export default fp(async (app) => {
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.ACCESS_TOKEN_TTL },
  })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'Non authentifié' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, name: true, role: true },
    })
    if (!user) {
      // Le compte a été supprimé alors qu'un access token était encore valide.
      return reply.code(401).send({ error: 'Non authentifié' })
    }
    req.currentUser = user
  })

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply)
    if (reply.sent) return
    if (req.currentUser?.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Réservé aux administrateurs' })
    }
  })

  app.decorate('issueSession', async (userId: string, userAgent?: string) => {
    const token = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000)
    await prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent ?? null },
    })
    return token
  })

  app.decorate('revokeSession', async (refreshToken: string) => {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(refreshToken) } })
  })
})

export { hashToken }

export const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400,
}
