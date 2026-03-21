/**
 * Role IDs match the database `roles` table.
 * These are stable integer IDs that are safe to embed in JWT payloads.
 *
 * To add a new role:
 * 1. Add a constant here
 * 2. Add a row to the ROLES array in prisma/seed.ts
 * 3. Define its permissions in ROLE_PERMISSIONS in prisma/seed.ts
 * 4. Run: npm run db:seed
 */
export const ROLES = {
  SUPER_ADMIN: 1,
  OWNER: 2,
  MANAGER: 3,
  CASHIER: 4,
} as const

export type RoleId = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_NAMES: Record<RoleId, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.OWNER]: 'Owner',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.CASHIER]: 'Cashier',
}

/** Roles that can manage multiple outlets and users */
export const ADMIN_ROLES: RoleId[] = [ROLES.SUPER_ADMIN, ROLES.OWNER]

/** Roles that can access management features */
export const MANAGEMENT_ROLES: RoleId[] = [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.MANAGER]
