import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyError } from 'fastify'
import { config, isProd } from './config.js'
import { initDatabase, prisma } from './lib/prisma.js'
import authPlugin from './plugins/auth.js'
import adminRoutes from './routes/admin.js'
import aiRoutes from './routes/ai.js'
import authRoutes from './routes/auth.js'
import bottleRoutes from './routes/bottles.js'
import eventRoutes from './routes/events.js'
import rackRoutes from './routes/racks.js'
import statsRoutes from './routes/stats.js'
import wineRoutes from './routes/wines.js'
import { seedReferenceData } from './seed.js'

const app = Fastify({
  logger: isProd
    ? { level: 'info' }
    : { level: 'debug', transport: { target: 'pino-pretty' } },
  // Les photos d'étiquette arrivent en base64 dans le corps JSON.
  bodyLimit: 12 * 1024 * 1024,
  trustProxy: true,
})

await app.register(fastifyHelmet, {
  // Le SPA est servi par ce même serveur ; CSP par défaut casserait Vite en dev.
  contentSecurityPolicy: isProd
    ? {
        directives: {
          defaultSrc: ["'self'"],
          // Les visuels de bouteilles sont servis par le CDN Vivino.
          imgSrc: ["'self'", 'data:', 'blob:', 'https://images.vivino.com'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      }
    : false,
})

await app.register(fastifyRateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  // Derrière Caddy, req.ip est déjà l'IP réelle grâce à trustProxy.
  keyGenerator: (req) => req.ip,
})

await app.register(authPlugin)

app.get('/api/health', async () => {
  await prisma.$queryRaw`SELECT 1`
  return { status: 'ok', version: process.env['APP_VERSION'] ?? 'dev' }
})

await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(rackRoutes, { prefix: '/api/racks' })
await app.register(bottleRoutes, { prefix: '/api/bottles' })
await app.register(wineRoutes, { prefix: '/api/wines' })
await app.register(aiRoutes, { prefix: '/api/ai' })
await app.register(statsRoutes, { prefix: '/api/stats' })
await app.register(adminRoutes, { prefix: '/api/admin' })
await app.register(eventRoutes, { prefix: '/api/events' })

// Une seule image Docker sert l'API et le SPA compilé : c'est ce qui rend le branchement
// derrière un Caddy partagé trivial (un seul reverse_proxy, pas de CORS).
if (config.SERVE_STATIC) {
  const staticDir = resolve(config.STATIC_DIR)
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir, prefix: '/' })

    // Fallback SPA : toute route inconnue non-API renvoie index.html pour que le routeur
    // Vue prenne la main sur un rechargement de page profonde.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Route inconnue' })
      }
      return reply.sendFile('index.html')
    })
  } else {
    app.log.warn(`SERVE_STATIC actif mais ${staticDir} est introuvable — API seule.`)
  }
}

app.setErrorHandler((error: FastifyError, req, reply) => {
  req.log.error({ err: error }, 'Erreur non gérée')
  const status = error.statusCode ?? 500
  // En production, on ne renvoie jamais le message interne d'une 500.
  reply.code(status).send({
    error: status >= 500 && isProd ? 'Erreur interne du serveur' : error.message,
  })
})

async function start() {
  await initDatabase()
  await seedReferenceData()

  // Les sessions expirées s'accumulent sinon indéfiniment.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })

  await app.listen({ port: config.PORT, host: config.HOST })
  app.log.info(`Cave démarrée sur ${config.HOST}:${config.PORT}`)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} reçu, arrêt en cours`)
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}

start().catch((error) => {
  app.log.error({ err: error }, 'Démarrage impossible')
  process.exit(1)
})
