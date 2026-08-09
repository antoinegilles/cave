import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 16

/**
 * Hachage scrypt (built-in Node) plutôt qu'argon2 : évite une dépendance native à compiler
 * pour amd64 et arm64 dans l'image Docker. scrypt est memory-hard et recommandé par l'OWASP.
 *
 * Format : `scrypt$<salt hex>$<hash hex>` — le préfixe permet une migration future d'algo.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false

  const expected = Buffer.from(hashHex, 'hex')
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)

  // timingSafeEqual jette si les longueurs diffèrent — on la contrôle d'abord.
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}
