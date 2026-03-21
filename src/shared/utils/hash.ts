import bcrypt from 'bcryptjs'
import { env } from '../../config/env'

/**
 * Hash a plain text password using bcrypt.
 * Rounds are read from env (default: 12).
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS)
}

/**
 * Compare a plain text password against a stored bcrypt hash.
 */
export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed)
}
