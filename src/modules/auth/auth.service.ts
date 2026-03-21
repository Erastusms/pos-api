import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { redis } from '../../infrastructure/cache/redis.client'
import { hashPassword, comparePassword } from '../../shared/utils/hash'
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} from '../../shared/errors'
import { authRepository, type UserWithRole } from './auth.repository'
import type { RegisterInput, LoginInput } from './auth.schema'
import type { AccessTokenPayload } from '../../shared/middlewares/authenticate'
import type { RoleId } from '../../shared/constants/roles'

// ─── Token helpers ────────────────────────────────────────────────────────────

interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds until access token expiry
}

function generateAccessToken(user: UserWithRole): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    roleId: user.roleId as RoleId,
    outletId: user.outletId,
    type: 'access',
  }
  // Use type assertion to satisfy @types/jsonwebtoken overload — expiresIn IS valid
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as unknown as number,
  })
}

function generateRefreshToken(): string {
  // Cryptographically secure opaque token — NOT a JWT (cannot be decoded by client)
  return crypto.randomBytes(64).toString('hex')
}

/**
 * Parse "15m", "1h", "7d" → seconds
 */
function parseExpiresInToSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/)
  if (!match || !match[1] || !match[2]) return 900
  const value = parseInt(match[1], 10)
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
  return value * (multipliers[match[2]] ?? 60)
}

async function issueTokenPair(
  user: UserWithRole,
  meta: { deviceInfo?: string; ipAddress?: string },
): Promise<AuthTokens> {
  const accessToken = generateAccessToken(user)
  const refreshToken = generateRefreshToken()
  const expiresIn = parseExpiresInToSeconds(env.JWT_ACCESS_EXPIRES_IN)

  const refreshExpiresAt = new Date()
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + env.JWT_REFRESH_EXPIRES_IN_DAYS)

  await authRepository.createRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt: refreshExpiresAt,
    deviceInfo: meta.deviceInfo,
    ipAddress: meta.ipAddress,
  })

  return { accessToken, refreshToken, expiresIn }
}

// ─── Strip sensitive fields before sending to client ─────────────────────────

function sanitizeUser(user: UserWithRole) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    roleId: user.roleId,
    roleName: user.role.displayName,
    outletId: user.outletId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

// ─── Auth service ─────────────────────────────────────────────────────────────

export const authService = {
  async register(
    input: RegisterInput,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await authRepository.findUserByEmail(input.email)
    if (existing) {
      throw new ConflictError('Email sudah terdaftar', 'EMAIL_ALREADY_EXISTS')
    }

    const hashedPassword = await hashPassword(input.password)

    const user = await authRepository.createUser({
      name: input.name,
      email: input.email,
      password: hashedPassword,
      phone: input.phone,
      role: { connect: { id: input.roleId ?? 4 } },
      ...(input.outletId ? { outlet: { connect: { id: input.outletId } } } : {}),
    })

    await authRepository.createAuditLog({
      userId: user.id,
      action: 'REGISTER',
      resource: 'user',
      resourceId: user.id,
      newData: { email: user.email, roleId: user.roleId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return sanitizeUser(user)
  },

  async login(
    input: LoginInput,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await authRepository.findUserByEmail(input.email)

    // Always run bcrypt compare to prevent timing attacks — even for non-existent users
    const passwordToCheck = user?.password ?? '$2b$12$invalidhashtopreventtimingattacks'
    const isMatch = await comparePassword(input.password, passwordToCheck)

    if (!user || !isMatch) {
      throw new UnauthorizedError('Email atau password salah', 'INVALID_CREDENTIALS')
    }

    if (!user.isActive) {
      throw new UnauthorizedError(
        'Akun Anda telah dinonaktifkan. Hubungi administrator.',
        'ACCOUNT_DISABLED',
      )
    }

    const tokens = await issueTokenPair(user, {
      deviceInfo: input.deviceInfo ?? meta.userAgent,
      ipAddress: meta.ipAddress,
    })

    await authRepository.createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      resource: 'user',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return { user: sanitizeUser(user), tokens }
  },

  async refreshToken(
    token: string,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const stored = await authRepository.findRefreshToken(token)

    if (!stored) {
      throw new UnauthorizedError('Refresh token tidak ditemukan', 'INVALID_REFRESH_TOKEN')
    }

    if (stored.isRevoked) {
      // Token reuse detected — possible theft. Revoke ALL sessions for this user.
      await authRepository.revokeAllUserRefreshTokens(stored.userId)
      throw new UnauthorizedError(
        'Token sudah pernah digunakan. Semua sesi telah dihapus demi keamanan.',
        'REFRESH_TOKEN_REUSE',
      )
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token sudah kadaluarsa', 'REFRESH_TOKEN_EXPIRED')
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedError('Akun telah dinonaktifkan', 'ACCOUNT_DISABLED')
    }

    // Rotate: revoke old token, issue fresh pair
    await authRepository.revokeRefreshToken(token)
    const tokens = await issueTokenPair(stored.user, {
      deviceInfo: meta.userAgent,
      ipAddress: meta.ipAddress,
    })

    return { user: sanitizeUser(stored.user), tokens }
  },

  async logout(
    accessToken: string,
    refreshToken: string,
    meta: { userId?: string; ipAddress?: string; userAgent?: string },
  ) {
    // 1. Blacklist the access token in Redis so it's immediately invalid
    try {
      const decoded = jwt.decode(accessToken) as { exp?: number } | null
      if (decoded?.exp) {
        const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000)
        if (ttlSeconds > 0) {
          await redis.setex(`blacklist:${accessToken}`, ttlSeconds, '1')
        }
      }
    } catch {
      // Non-critical: access token will naturally expire
    }

    // 2. Revoke the refresh token in DB
    const stored = await authRepository.findRefreshToken(refreshToken)
    if (stored && !stored.isRevoked) {
      await authRepository.revokeRefreshToken(refreshToken)
    }

    // 3. Audit log
    if (meta.userId) {
      await authRepository.createAuditLog({
        userId: meta.userId,
        action: 'LOGOUT',
        resource: 'user',
        resourceId: meta.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      })
    }
  },

  async logoutAll(userId: string, currentAccessToken: string) {
    // Revoke every active refresh token for this user across all devices
    await authRepository.revokeAllUserRefreshTokens(userId)

    // Blacklist the current access token
    try {
      const decoded = jwt.decode(currentAccessToken) as { exp?: number } | null
      if (decoded?.exp) {
        const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000)
        if (ttlSeconds > 0) {
          await redis.setex(`blacklist:${currentAccessToken}`, ttlSeconds, '1')
        }
      }
    } catch {
      // Non-critical
    }

    await authRepository.createAuditLog({
      userId,
      action: 'LOGOUT_ALL',
      resource: 'user',
      resourceId: userId,
    })
  },

  async getProfile(userId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new NotFoundError('User', 'USER_NOT_FOUND')
    }
    return sanitizeUser(user)
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new NotFoundError('User', 'USER_NOT_FOUND')
    }

    const isMatch = await comparePassword(currentPassword, user.password)
    if (!isMatch) {
      throw new BadRequestError('Password lama tidak sesuai', 'WRONG_CURRENT_PASSWORD')
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError(
        'Password baru tidak boleh sama dengan password lama',
        'SAME_PASSWORD',
      )
    }

    const hashed = await hashPassword(newPassword)
    await prisma_update_password(userId, hashed)

    // Force re-login on all devices after password change
    await authRepository.revokeAllUserRefreshTokens(userId)

    await authRepository.createAuditLog({
      userId,
      action: 'CHANGE_PASSWORD',
      resource: 'user',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return { success: true }
  },
}

// Isolated DB call for password update (avoids importing prisma directly into service)
async function prisma_update_password(userId: string, hashedPassword: string): Promise<void> {
  const { prisma } = await import('../../infrastructure/database/prisma.client')
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  })
}
