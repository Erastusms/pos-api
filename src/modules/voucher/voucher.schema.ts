import { z } from 'zod'

// ─── Shared enums ─────────────────────────────────────────────────────────────

const voucherTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT'])
const voucherScopeEnum = z.enum(['PER_BILL', 'PER_ITEM'])

// ─── Create ───────────────────────────────────────────────────────────────────

export const createVoucherSchema = z
  .object({
    name: z
      .string({ required_error: 'Nama voucher wajib diisi' })
      .min(2, 'Nama minimal 2 karakter')
      .max(100)
      .trim(),
    code: z
      .string()
      .min(2, 'Kode minimal 2 karakter')
      .max(50, 'Kode maksimal 50 karakter')
      .toUpperCase()
      .regex(/^[A-Z0-9_-]+$/, 'Kode hanya boleh huruf kapital, angka, dash, dan underscore')
      .optional(),
    description: z.string().max(500).optional(),
    type: voucherTypeEnum,
    scope: voucherScopeEnum,
    value: z
      .number({ required_error: 'Nilai diskon wajib diisi' })
      .positive('Nilai harus lebih dari 0'),
    minPurchase: z.number().min(0).optional(),
    maxDiscount: z.number().min(0).optional(),

    // Usage limits
    usageLimit: z.number().int().min(1).optional(),
    usageLimitPerCustomer: z.number().int().min(1).optional(),

    // Auto-apply
    autoApply: z.boolean().default(false),
    priority: z.number().int().min(0).default(0),

    // Targeting
    customerId: z.string().cuid('Format customer ID tidak valid').optional(),

    isActive: z.boolean().default(true),
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),

    /** productIds wajib diisi jika scope = PER_ITEM */
    productIds: z.array(z.string().cuid()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    // PERCENTAGE max 100%
    if (data.type === 'PERCENTAGE' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 100,
        type: 'number',
        inclusive: true,
        path: ['value'],
        message: 'Persentase diskon maksimal 100%',
      })
    }

    // PER_ITEM wajib ada productIds
    if (data.scope === 'PER_ITEM' && data.productIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: 'array',
        inclusive: true,
        path: ['productIds'],
        message: 'Voucher PER_ITEM harus memiliki minimal 1 produk',
      })
    }

    // code wajib ada jika autoApply=false
    if (!data.autoApply && !data.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['code'],
        message: 'Kode voucher wajib diisi jika autoApply=false',
      })
    }

    // endAt harus setelah startAt
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'endAt harus setelah startAt',
      })
    }
  })

export type CreateVoucherInput = z.infer<typeof createVoucherSchema>

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateVoucherSchema = z
  .object({
    name: z.string().min(2).max(100).trim().optional(),
    code: z
      .string()
      .min(2)
      .max(50)
      .toUpperCase()
      .regex(/^[A-Z0-9_-]+$/)
      .nullable()
      .optional(),
    description: z.string().max(500).nullable().optional(),
    type: voucherTypeEnum.optional(),
    scope: voucherScopeEnum.optional(),
    value: z.number().positive().optional(),
    minPurchase: z.number().min(0).nullable().optional(),
    maxDiscount: z.number().min(0).nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    usageLimitPerCustomer: z.number().int().min(1).nullable().optional(),
    autoApply: z.boolean().optional(),
    priority: z.number().int().min(0).optional(),
    customerId: z.string().cuid().nullable().optional(),
    isActive: z.boolean().optional(),
    startAt: z.string().datetime({ offset: true }).nullable().optional(),
    endAt: z.string().datetime({ offset: true }).nullable().optional(),
    productIds: z.array(z.string().cuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENTAGE' && data.value !== undefined && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 100,
        type: 'number',
        inclusive: true,
        path: ['value'],
        message: 'Persentase diskon maksimal 100%',
      })
    }
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'endAt harus setelah startAt',
      })
    }
  })

export type UpdateVoucherInput = z.infer<typeof updateVoucherSchema>

// ─── List query ───────────────────────────────────────────────────────────────

export const listVoucherQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  type: voucherTypeEnum.optional(),
  scope: voucherScopeEnum.optional(),
  isActive: z.enum(['true', 'false']).optional(),
  autoApply: z.enum(['true', 'false']).optional(),
  includeExpired: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
})

export type ListVoucherQuery = z.infer<typeof listVoucherQuerySchema>

// ─── Validate / apply ─────────────────────────────────────────────────────────

export const validateVoucherSchema = z.object({
  code: z.string({ required_error: 'Kode voucher wajib diisi' }).min(1).toUpperCase(),
  cartId: z.string().cuid('Format cart ID tidak valid').optional(),
  customerId: z.string().cuid('Format customer ID tidak valid').optional(),
  /** Nilai subtotal cart untuk cek minPurchase */
  subtotal: z.number().min(0).optional().default(0),
})

export type ValidateVoucherInput = z.infer<typeof validateVoucherSchema>

export const applyVoucherToCartSchema = z
  .object({
    /** code ATAU voucherId wajib ada salah satu */
    code: z.string().min(1).toUpperCase().optional(),
    voucherId: z.string().cuid().optional(),
    customerId: z.string().cuid().optional(),
  })
  .refine((d) => d.code !== undefined || d.voucherId !== undefined, {
    message: 'Salah satu dari code atau voucherId wajib diisi',
    path: ['code'],
  })

export type ApplyVoucherToCartInput = z.infer<typeof applyVoucherToCartSchema>

// ─── Auto-apply query ─────────────────────────────────────────────────────────

export const autoApplyQuerySchema = z.object({
  subtotal: z
    .string({ required_error: 'subtotal wajib diisi' })
    .transform((v) => parseFloat(v))
    .pipe(z.number().min(0, 'subtotal harus >= 0')),
  customerId: z.string().cuid().optional(),
})

export type AutoApplyQuery = z.infer<typeof autoApplyQuerySchema>

// ─── Redemption list query ────────────────────────────────────────────────────

export const listRedemptionQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
})

export type ListRedemptionQuery = z.infer<typeof listRedemptionQuerySchema>

// ─── Response schemas (for Swagger) ──────────────────────────────────────────

export const voucherProductSchema = {
  type: 'object',
  properties: {
    productId: { type: 'string' },
    product: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        sku: { type: 'string' },
      },
    },
  },
}

export const voucherResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    outletId: { type: 'string' },
    name: { type: 'string' },
    code: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
    scope: { type: 'string', enum: ['PER_BILL', 'PER_ITEM'] },
    value: { type: 'number' },
    minPurchase: { type: 'number', nullable: true },
    maxDiscount: { type: 'number', nullable: true },
    usageLimit: { type: 'number', nullable: true },
    usageLimitPerCustomer: { type: 'number', nullable: true },
    usageCount: { type: 'number' },
    autoApply: { type: 'boolean' },
    priority: { type: 'number' },
    customerId: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    startAt: { type: 'string', format: 'date-time', nullable: true },
    endAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    products: { type: 'array', items: voucherProductSchema },
    _count: { type: 'object', additionalProperties: true },
    isExpired: { type: 'boolean', description: 'true jika endAt sudah lewat' },
    isUsageLimitReached: { type: 'boolean', description: 'true jika usageCount >= usageLimit' },
    remainingUses: {
      type: 'number',
      nullable: true,
      description: 'Sisa penggunaan (null = tidak terbatas)',
    },
  },
}

export const voucherValidationResultSchema = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    reason: { type: 'string', nullable: true, description: 'Alasan tidak valid (null jika valid)' },
    voucher: { ...voucherResponseSchema, nullable: true },
    discountPreview: {
      type: 'object',
      nullable: true,
      properties: {
        discountAmount: { type: 'number' },
        discountedSubtotal: { type: 'number' },
        itemDiscountMap: { type: 'object', additionalProperties: true },
      },
    },
  },
}

export const voucherRedemptionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    voucherId: { type: 'string' },
    outletId: { type: 'string' },
    customerId: { type: 'string', nullable: true },
    orderId: { type: 'string', nullable: true },
    discountAmount: { type: 'number' },
    redeemedAt: { type: 'string', format: 'date-time' },
    customer: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string', nullable: true },
      },
    },
  },
}
