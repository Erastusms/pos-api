import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock all external dependencies BEFORE importing the service ──────────────

vi.mock('../../../infrastructure/database/prisma.client', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}))

vi.mock('../../../infrastructure/cache/redis.client', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}))

vi.mock('../auth.repository', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllUserRefreshTokens: vi.fn(),
    createAuditLog: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../../../shared/utils/hash', () => ({
  hashPassword: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  comparePassword: vi.fn(),
}))

// ─── Now import the service and mocked deps ───────────────────────────────────

import { authService } from '../auth.service'
import { authRepository } from '../auth.repository'
import { comparePassword } from '../../../shared/utils/hash'
import { ConflictError, UnauthorizedError } from '../../../shared/errors'

// ─── Test data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-001',
  name: 'Test User',
  email: 'test@example.com',
  password: '$2b$12$hashedpassword',
  phone: null,
  pin: null,
  isActive: true,
  roleId: 4,
  outletId: 'outlet-001',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  role: { id: 4, name: 'CASHIER', displayName: 'Kasir' },
}

const mockMeta = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authRepository.createAuditLog).mockResolvedValue({} as never)
  })

  it('creates a new user when email is not taken', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null)
    vi.mocked(authRepository.createUser).mockResolvedValue(mockUser)

    const result = await authService.register(
      { name: 'Test User', email: 'test@example.com', password: 'Password123', roleId: 4 },
      mockMeta,
    )

    expect(result.email).toBe('test@example.com')
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('pin')
    expect(authRepository.createUser).toHaveBeenCalledOnce()
  })

  it('throws ConflictError when email is already registered', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(mockUser)

    await expect(
      authService.register(
        { name: 'Test', email: 'test@example.com', password: 'Password123', roleId: 4 },
        mockMeta,
      ),
    ).rejects.toThrow(ConflictError)
  })

  it('never returns password or pin in response', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null)
    vi.mocked(authRepository.createUser).mockResolvedValue(mockUser)

    const result = await authService.register(
      { name: 'Test', email: 'new@example.com', password: 'Password123', roleId: 4 },
      mockMeta,
    )

    expect(Object.keys(result)).not.toContain('password')
    expect(Object.keys(result)).not.toContain('pin')
  })
})

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authRepository.createAuditLog).mockResolvedValue({} as never)
    vi.mocked(authRepository.createRefreshToken).mockResolvedValue({} as never)
  })

  it('returns user and tokens on valid credentials', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(mockUser)
    vi.mocked(comparePassword).mockResolvedValue(true)

    const result = await authService.login(
      { email: 'test@example.com', password: 'Password123' },
      mockMeta,
    )

    expect(result.user.email).toBe('test@example.com')
    expect(result.tokens.accessToken).toBeTruthy()
    expect(result.tokens.refreshToken).toBeTruthy()
    expect(result.tokens.expiresIn).toBeTypeOf('number')
  })

  it('throws UnauthorizedError when user is not found', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null)
    vi.mocked(comparePassword).mockResolvedValue(false)

    await expect(
      authService.login({ email: 'ghost@example.com', password: 'anything' }, mockMeta),
    ).rejects.toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when password is wrong', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(mockUser)
    vi.mocked(comparePassword).mockResolvedValue(false)

    await expect(
      authService.login({ email: 'test@example.com', password: 'WrongPass1' }, mockMeta),
    ).rejects.toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when account is inactive', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue({
      ...mockUser,
      isActive: false,
    })
    vi.mocked(comparePassword).mockResolvedValue(true)

    await expect(
      authService.login({ email: 'test@example.com', password: 'Password123' }, mockMeta),
    ).rejects.toThrow(UnauthorizedError)
  })

  it('never exposes password in returned user object', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(mockUser)
    vi.mocked(comparePassword).mockResolvedValue(true)

    const result = await authService.login(
      { email: 'test@example.com', password: 'Password123' },
      mockMeta,
    )

    expect(Object.keys(result.user)).not.toContain('password')
  })
})

describe('authService.refreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authRepository.createAuditLog).mockResolvedValue({} as never)
    vi.mocked(authRepository.createRefreshToken).mockResolvedValue({} as never)
  })

  it('issues new token pair and rotates the refresh token', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue({
      id: 'rt-001',
      token: 'valid-refresh-token',
      userId: 'user-001',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      user: mockUser,
    })
    vi.mocked(authRepository.revokeRefreshToken).mockResolvedValue({} as never)

    const result = await authService.refreshToken('valid-refresh-token', mockMeta)

    expect(result.tokens.accessToken).toBeTruthy()
    expect(result.tokens.refreshToken).toBeTruthy()
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith('valid-refresh-token')
  })

  it('throws on revoked token and revokes all user sessions', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue({
      id: 'rt-002',
      token: 'revoked-token',
      userId: 'user-001',
      isRevoked: true,
      expiresAt: new Date(Date.now() + 86400000),
      user: mockUser,
    })

    await expect(authService.refreshToken('revoked-token', mockMeta)).rejects.toThrow(
      UnauthorizedError,
    )
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-001')
  })

  it('throws on expired token', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue({
      id: 'rt-003',
      token: 'expired-token',
      userId: 'user-001',
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000), // past
      user: mockUser,
    })

    await expect(authService.refreshToken('expired-token', mockMeta)).rejects.toThrow(
      UnauthorizedError,
    )
  })
})

describe('authService.getProfile', () => {
  it('returns sanitized user without password', async () => {
    vi.mocked(authRepository.findUserById).mockResolvedValue(mockUser)

    const result = await authService.getProfile('user-001')

    expect(result.id).toBe('user-001')
    expect(Object.keys(result)).not.toContain('password')
  })
})
