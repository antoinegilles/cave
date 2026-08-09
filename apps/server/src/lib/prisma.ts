import { PrismaClient } from '@prisma/client'
import { config, isProd } from '../config.js'

export const prisma = new PrismaClient({
  log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  datasources: { db: { url: config.DATABASE_URL } },
})

/**
 * SQLite sérialise les écritures : sans WAL, une lecture concurrente bloque un écrivain et
 * on prend des SQLITE_BUSY dès qu'on scrape en tâche de fond pendant une navigation.
 */
export async function initDatabase(): Promise<void> {
  // `$queryRawUnsafe` et non `$executeRawUnsafe` : plusieurs de ces PRAGMA renvoient une
  // ligne de résultat, ce que le driver SQLite refuse sur un `execute`.
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;')
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;')
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;')
}
