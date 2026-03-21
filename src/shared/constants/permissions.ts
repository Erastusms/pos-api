/**
 * Resource and action constants for RBAC.
 * These must match the `permissions` table in the database.
 *
 * Usage in routes:
 *   preHandler: [authenticate, authorize(RESOURCES.PRODUCT, ACTIONS.CREATE)]
 */
export const RESOURCES = {
  USER: 'user',
  OUTLET: 'outlet',
  PRODUCT: 'product',
  INVENTORY: 'inventory',
  TRANSACTION: 'transaction',
  CUSTOMER: 'customer',
  EMPLOYEE: 'employee',
  DISCOUNT: 'discount',
  REPORT: 'report',
} as const

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  VOID: 'void',
} as const

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES]
export type Action = (typeof ACTIONS)[keyof typeof ACTIONS]

/** Cache TTL for role permissions in Redis (10 minutes) */
export const PERMISSIONS_CACHE_TTL = 600
