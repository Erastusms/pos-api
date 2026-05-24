import { z } from 'zod'

// ─── Customer ─────────────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: z
    .string({ required_error: 'Nama customer wajib diisi' })
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter')
    .trim(),
  email: z.string().email('Format email tidak valid').toLowerCase().trim().optional(),
  phone: z
    .string()
    .regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Format nomor telepon tidak valid')
    .optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD')
    .optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>

export const listCustomerQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
})

export type ListCustomerQuery = z.infer<typeof listCustomerQuerySchema>

// ─── Loyalty Program ─────────────────────────────────────────────────────────

export const upsertLoyaltyProgramSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  pointsPerRupiah: z.number().positive('pointsPerRupiah harus lebih dari 0').optional(),
  minimumSpend: z.number().min(0).optional(),
  pointValue: z.number().positive('pointValue harus lebih dari 0').optional(),
  minimumRedeemPoints: z.number().int().min(1).optional(),
  pointExpiryDays: z.number().int().min(0).optional(),
})

export type UpsertLoyaltyProgramInput = z.infer<typeof upsertLoyaltyProgramSchema>

// ─── Loyalty — manual adjust ──────────────────────────────────────────────────

export const adjustPointsSchema = z.object({
  customerId: z
    .string({ required_error: 'Customer ID wajib diisi' })
    .cuid('Format customer ID tidak valid'),
  points: z
    .number({ required_error: 'Jumlah poin wajib diisi' })
    .int('Poin harus berupa bilangan bulat')
    .refine((v) => v !== 0, { message: 'Poin tidak boleh 0' }),
  description: z.string().max(500).optional(),
})

export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>

// ─── Redeem ───────────────────────────────────────────────────────────────────

export const redeemPointsSchema = z.object({
  customerId: z.string({ required_error: 'Customer ID wajib diisi' }).cuid(),
  points: z
    .number({ required_error: 'Jumlah poin wajib diisi' })
    .int()
    .positive('Poin yang di-redeem harus lebih dari 0'),
  orderId: z.string().cuid().optional(),
})

export type RedeemPointsInput = z.infer<typeof redeemPointsSchema>

// ─── Loyalty transaction list ─────────────────────────────────────────────────

const loyaltyTxTypeEnum = z.enum(['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REFUND'])

export const listLoyaltyTxQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  type: loyaltyTxTypeEnum.optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
})

export type ListLoyaltyTxQuery = z.infer<typeof listLoyaltyTxQuerySchema>

// ─── Response schemas (for Swagger) ──────────────────────────────────────────

export const customerResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    outletId: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    birthDate: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    loyaltyPoints: { type: 'number', description: 'Saldo poin aktif customer' },
  },
}

export const loyaltyProgramResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    outletId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    pointsPerRupiah: { type: 'number' },
    minimumSpend: { type: 'number' },
    pointValue: { type: 'number' },
    minimumRedeemPoints: { type: 'number' },
    pointExpiryDays: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

export const loyaltyTransactionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    customerId: { type: 'string' },
    outletId: { type: 'string' },
    orderId: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REFUND'] },
    points: { type: 'number' },
    pointsBefore: { type: 'number' },
    pointsAfter: { type: 'number' },
    rupiah: { type: 'number', nullable: true },
    description: { type: 'string', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

export const customerPointSummarySchema = {
  type: 'object',
  properties: {
    totalPoints: { type: 'number', description: 'Total poin aktif' },
    totalEarned: { type: 'number', description: 'Total poin yang pernah dikumpulkan' },
    totalRedeemed: { type: 'number', description: 'Total poin yang pernah digunakan' },
    totalExpired: { type: 'number', description: 'Total poin yang expired' },
    rupiahValue: { type: 'number', description: 'Nilai rupiah dari poin saat ini' },
  },
}
