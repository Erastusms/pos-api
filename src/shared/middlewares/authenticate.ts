import type { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { redis } from '../../infrastructure/cache/redis.client'
import { UnauthorizedError } from '../errors'
import type { RoleId } from '../constants/roles'

export interface AccessTokenPayload {
  sub: string       // userId
  email: string
  name: string
  roleId: RoleId
  outletId: string | null
  type: 'access'
}

/**
 * Fastify preHandler hook — verifies the Bearer JWT access token.
 *
 * On success: populates `request.user` for the rest of the request lifecycle.
 * On failure: throws UnauthorizedError (handled by global error handler).
 *
 * Checks Redis blacklist so that logged-out tokens are immediately rejected,
 * even if they haven't expired yet.
 *
 * Usage:
 *   preHandler: [authenticate]
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token autentikasi tidak ditemukan', 'MISSING_TOKEN')
  }

  const token = authHeader.slice(7)

  // Check if token has been blacklisted (logged out)
  try {
    const isBlacklisted = await redis.get(`blacklist:${token}`)
    if (isBlacklisted) {
      throw new UnauthorizedError('Token sudah tidak valid, silakan login ulang', 'TOKEN_REVOKED')
    }
  } catch (redisErr) {
    // If Redis is down, let the JWT verification proceed (fail open for cache)
    // This is an intentional trade-off: Redis outage should not block all users
    if (redisErr instanceof UnauthorizedError) throw redisErr
    request.log.warn('Redis unavailable during token blacklist check')
  }

  let payload: AccessTokenPayload
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
  } catch {
    throw new UnauthorizedError('Token tidak valid atau sudah kadaluarsa', 'INVALID_TOKEN')
  }

  if (payload.type !== 'access') {
    throw new UnauthorizedError('Tipe token tidak valid', 'INVALID_TOKEN_TYPE')
  }

  request.user = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    roleId: payload.roleId,
    outletId: payload.outletId,
  }
}
