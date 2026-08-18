import { changePasswordSchema, loginSchema, registerSchema } from '@cave/shared'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { defaultCellarCreate } from '../lib/defaultCellar.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import { REFRESH_COOKIE, hashToken, refreshCookieOptions } from '../plugins/auth.js'

export default async function authRoutes(app: FastifyInstance) {
  /** Public : indique au client s'il doit afficher le lien « Créer un compte ». */
  app.get('/config', async () => ({
    registrationOpen: config.REGISTRATION_MODE !== 'closed',
    requiresInviteCode: config.REGISTRATION_MODE === 'invite',
  }))

  app.post('/register', {
    // Une inscription publique est une surface d'abus : on borne fortement les tentatives.
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (req, reply) => {
      if (config.REGISTRATION_MODE === 'closed') {
        return reply.code(403).send({ error: 'Les inscriptions sont fermées.' })
      }

      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Requête invalide',
          issues: parsed.error.issues,
        })
      }

      if (
        config.REGISTRATION_MODE === 'invite' &&
        parsed.data.inviteCode !== config.REGISTRATION_INVITE_CODE
      ) {
        return reply.code(403).send({ error: 'Code d’invitation invalide.' })
      }

      const email = parsed.data.email.toLowerCase()
      if (await prisma.user.findUnique({ where: { email } })) {
        return reply.code(409).send({ error: 'Un compte existe déjà avec cette adresse.' })
      }

      // Le tout premier compte devient administrateur — sinon une instance neuve
      // n'aurait personne pour configurer les casiers ni piloter les flags.
      const isFirstUser = (await prisma.user.count()) === 0

      const passwordHash = await hashPassword(parsed.data.password)
      const user = await prisma.$transaction((tx) =>
        tx.user.create({
          data: {
            email,
            name: parsed.data.name.trim(),
            role: isFirstUser ? 'ADMIN' : 'USER',
            passwordHash,
            racks: { create: defaultCellarCreate() },
          },
        }),
      )

      // On connecte directement : demander de se reconnecter juste après s'être
      // inscrit n'apporte rien et fait perdre du monde en route.
      const refreshToken = await app.issueSession(user.id, req.headers['user-agent'])
      const accessToken = app.jwt.sign({ sub: user.id, role: user.role })

      return reply
        .setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
        .code(201)
        .send({
          accessToken,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        })
    },
  })

  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    handler: async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
      }

      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })

      // On vérifie un hash factice quand l'utilisateur n'existe pas : sans ça, la différence
      // de temps de réponse permet d'énumérer les comptes existants.
      const stored = user?.passwordHash ?? 'scrypt$00$00'
      const ok = await verifyPassword(parsed.data.password, stored)

      if (!user || !ok) {
        return reply.code(401).send({ error: 'Identifiants incorrects' })
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

      const refreshToken = await app.issueSession(user.id, req.headers['user-agent'])
      const accessToken = app.jwt.sign({ sub: user.id, role: user.role })

      return reply
        .setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
        .send({
          accessToken,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        })
    },
  })

  app.post('/refresh', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE]
    if (!token) return reply.code(401).send({ error: 'Session expirée' })

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } })
      return reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions).code(401).send({ error: 'Session expirée' })
    }

    const accessToken = app.jwt.sign({ sub: session.user.id, role: session.user.role })
    return reply.send({
      accessToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    })
  })

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE]
    if (token) await app.revokeSession(token)
    return reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions).send({ ok: true })
  })

  app.get('/me', { preHandler: app.authenticate }, async (req) => ({ user: req.currentUser }))

  app.post('/password', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Requête invalide', issues: parsed.error.issues })
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } })
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: 'Mot de passe actuel incorrect' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    })

    // Changer de mot de passe doit déconnecter les autres appareils.
    await prisma.session.deleteMany({ where: { userId: user.id } })

    return reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions).send({ ok: true })
  })
}
