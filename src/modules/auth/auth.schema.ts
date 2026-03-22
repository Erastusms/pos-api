import { z } from 'zod'

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Nama wajib diisi' })
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter')
    .trim(),
  email: z
    .string({ required_error: 'Email wajib diisi' })
    .email('Format email tidak valid')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password wajib diisi' })
    .min(8, 'Password minimal 8 karakter')
    .max(72, 'Password maksimal 72 karakter')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password harus mengandung huruf besar, huruf kecil, dan angka',
    ),
  phone: z
    .string()
    .regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Format nomor telepon tidak valid')
    .optional(),
  outletId: z.string().min(1).optional(),
  roleId: z.number().int().min(1).max(4).default(4), // default: CASHIER
})

export type RegisterInput = z.input<typeof registerSchema>

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi' })
    .email('Format email tidak valid')
    .toLowerCase()
    .trim(),
  password: z.string({ required_error: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
  deviceInfo: z.string().max(500).optional(), // User-Agent string from client
})

export type LoginInput = z.infer<typeof loginSchema>

// ─── Refresh Token ────────────────────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token wajib diisi' }).min(1),
})

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logoutSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token wajib diisi' }).min(1),
})

export type LogoutInput = z.infer<typeof logoutSchema>

// ─── Response shapes (for Swagger documentation) ─────────────────────────────

export const userProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string', nullable: true },
    roleId: { type: 'number' },
    roleName: { type: 'string' },
    outletId: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

export const authTokensSchema = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    expiresIn: { type: 'number', description: 'Access token TTL in seconds' },
  },
}
