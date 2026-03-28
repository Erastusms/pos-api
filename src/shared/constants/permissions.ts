export const RESOURCES = {
  USER:        'user',
  OUTLET:      'outlet',
  CATEGORY:    'category',
  PRODUCT:     'product',
  INVENTORY:   'inventory',
  TRANSACTION: 'transaction',
  CUSTOMER:    'customer',
  EMPLOYEE:    'employee',
  DISCOUNT:    'discount',
  REPORT:      'report',
  SUPPLIER:    'supplier',
} as const

export const ACTIONS = {
  CREATE: 'create',
  READ:   'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  VOID:   'void',
} as const

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES]
export type Action   = (typeof ACTIONS)[keyof typeof ACTIONS]

export const PERMISSIONS_CACHE_TTL = 600
