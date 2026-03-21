import type { RoleId } from '../constants/roles'

/**
 * Augment Fastify's Request interface so that after the `authenticate`
 * preHandler hook runs, controllers can safely access `request.user`
 * with full TypeScript type safety — no casts, no `any`.
 */
declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Populated by the `authenticate` middleware after JWT verification.
     * Guaranteed to exist on any route that uses the authenticate preHandler.
     */
    user: {
      id: string
      email: string
      name: string
      roleId: RoleId
      outletId: string | null
    }
  }
}
