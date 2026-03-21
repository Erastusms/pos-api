import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../infrastructure/database/prisma.client'
import { redis } from '../../infrastructure/cache/redis.client'
import { ForbiddenError, UnauthorizedError } from '../errors'
import type { Resource, Action } from '../constants/permissions'
import { PERMISSIONS_CACHE_TTL } from '../constants/permissions'

type PermissionEntry = { resource: string; action: string }

/**
 * Fastify preHandler factory — checks if the authenticated user's role
 * has the specified resource + action permission.
 *
 * Permissions are cached in Redis per role to avoid a DB hit on every request.
 * Cache is invalidated automatically after PERMISSIONS_CACHE_TTL seconds.
 *
 * IMPORTANT: Must be used AFTER the `authenticate` middleware.
 *
 * @example
 * preHandler: [authenticate, authorize('product', 'create')]
 */
export function authorize(resource: Resource, action: Action) {
  return async function authorizeHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError('Tidak terautentikasi', 'MISSING_AUTH')
    }

    const { roleId } = request.user
    const cacheKey = `permissions:role:${roleId}`

    let allowedPermissions: PermissionEntry[] = []

    // ── Try Redis cache first ─────────────────────────────────────────────────
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        allowedPermissions = JSON.parse(cached) as PermissionEntry[]
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    // ── Cache miss: load from DB ──────────────────────────────────────────────
    if (allowedPermissions.length === 0) {
      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId },
        include: {
          permission: { select: { resource: true, action: true } },
        },
      })

      allowedPermissions = rolePermissions.map(
        (rp: { permission: PermissionEntry }) => rp.permission,
      )

      try {
        await redis.setex(cacheKey, PERMISSIONS_CACHE_TTL, JSON.stringify(allowedPermissions))
      } catch {
        // Redis unavailable — continue without caching
      }
    }

    // ── Check permission ──────────────────────────────────────────────────────
    const hasPermission = allowedPermissions.some(
      (p) => p.resource === resource && p.action === action,
    )

    if (!hasPermission) {
      throw new ForbiddenError(
        `Anda tidak memiliki akses untuk melakukan aksi ini (${resource}:${action})`,
        'PERMISSION_DENIED',
      )
    }
  }
}
