// NOTE: Prisma types (Prisma.UserSelect, Prisma.UserGetPayload, Prisma.UserCreateInput)
// are generated at runtime via `npx prisma generate`. The explicit UserWithRole type
// below mirrors what Prisma would generate, ensuring full type safety without
// requiring the generated client to be present during CI type-checks.

import { prisma } from '../../infrastructure/database/prisma.client'

// ─── User shape returned from DB ──────────────────────────────────────────────

export type UserWithRole = {
  id: string
  name: string
  email: string
  phone: string | null
  password: string
  pin: string | null
  isActive: boolean
  roleId: number
  outletId: string | null
  createdAt: Date
  updatedAt: Date
  role: { id: number; name: string; displayName: string }
}

const userWithRoleSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  password: true,
  pin: true,
  isActive: true,
  roleId: true,
  outletId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, displayName: true } },
} as const

// ─── User create input ────────────────────────────────────────────────────────

type UserCreateData = {
  name: string
  email: string
  password: string
  phone?: string
  role: { connect: { id: number } }
  outlet?: { connect: { id: string } }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const authRepository = {
  findUserByEmail(email: string): Promise<UserWithRole | null> {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: userWithRoleSelect,
    }) as Promise<UserWithRole | null>
  },

  findUserById(id: string): Promise<UserWithRole | null> {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userWithRoleSelect,
    }) as Promise<UserWithRole | null>
  },

  createUser(data: UserCreateData): Promise<UserWithRole> {
    return prisma.user.create({
      data,
      select: userWithRoleSelect,
    }) as Promise<UserWithRole>
  },

  // ─── Refresh token queries ──────────────────────────────────────────────────

  createRefreshToken(data: {
    token: string
    userId: string
    expiresAt: Date
    deviceInfo?: string
    ipAddress?: string
  }) {
    return prisma.refreshToken.create({ data })
  },

  async findRefreshToken(token: string): Promise<{
    id: string
    token: string
    userId: string
    isRevoked: boolean
    expiresAt: Date
    user: UserWithRole
  } | null> {
    const result = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { select: userWithRoleSelect } },
    })
    return result as typeof result & { user: UserWithRole } | null
  },

  revokeRefreshToken(token: string) {
    return prisma.refreshToken.update({
      where: { token },
      data: { isRevoked: true },
    })
  },

  revokeAllUserRefreshTokens(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    })
  },

  deleteExpiredTokens(before: Date) {
    return prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: before } },
    })
  },

  // ─── Audit log ─────────────────────────────────────────────────────────────

  createAuditLog(data: {
    userId?: string
    action: string
    resource: string
    resourceId?: string
    oldData?: Record<string, unknown>
    newData?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
  }) {
    return prisma.auditLog.create({ data })
  },
}
