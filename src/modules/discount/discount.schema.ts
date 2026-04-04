import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────────────────────

const discountTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT'])
const discountScopeEnum = z.enum(['PER_ITEM', 'PER_BILL'])

// ─── Create ───────────────────────────────────────────────────────────────────

export const createDiscountSchema = z
  .object({
    name: z
      .string({ required_error: 'Nama diskon wajib diisi' })
      .min(2, 'Nama minimal 2 karakter')
      .max(100, 'Nama maksimal 100 karakter')
      .trim(),
    code: z
      .string()
      .min(2, 'Kode minimal 2 karakter')
      .max(50, 'Kode maksimal 50 karakter')
      .toUpperCase()
      .regex(/^[A-Z0-9_-]+$/, 'Kode hanya boleh huruf kapital, angka, dash, dan underscore')
      .optional(),
    description: z.string().max(500).optional(),
    type: discountTypeEnum,
    scope: discountScopeEnum,
    value: z
      .number({ required_error: 'Nilai diskon wajib diisi' })
      .positive('Nilai diskon harus lebih dari 0'),
    minPurchase: z.number().min(0).optional(),
    maxDiscount: z.number().min(0).optional(),
    isActive: z.boolean().default(true),
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
    /** productIds wajib diisi jika scope = PER_ITEM */
    productIds: z.array(z.string().cuid()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    // PERCENTAGE tidak boleh > 100
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

    // PER_ITEM harus ada productIds
    if (data.scope === 'PER_ITEM' && data.productIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: 'array',
        inclusive: true,
        path: ['productIds'],
        message: 'Diskon PER_ITEM harus memiliki minimal 1 produk',
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

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateDiscountSchema = z
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
    type: discountTypeEnum.optional(),
    scope: discountScopeEnum.optional(),
    value: z.number().positive().optional(),
    minPurchase: z.number().min(0).nullable().optional(),
    maxDiscount: z.number().min(0).nullable().optional(),
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

export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>

// ─── List query ───────────────────────────────────────────────────────────────

export const listDiscountQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  type: discountTypeEnum.optional(),
  scope: discountScopeEnum.optional(),
  isActive: z.enum(['true', 'false']).optional(),
  includeExpired: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
})

export type ListDiscountQuery = z.infer<typeof listDiscountQuerySchema>

// ─── Apply discount to cart ───────────────────────────────────────────────────

export const applyDiscountSchema = z
  .object({
    discountId: z.string().cuid('Format discount ID tidak valid').optional(),
    code: z.string().min(1).toUpperCase().optional(),
  })
  .refine((d) => d.discountId !== undefined || d.code !== undefined, {
    message: 'Salah satu dari discountId atau code wajib diisi',
  })

export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>

// ─── Response schemas (for Swagger) ──────────────────────────────────────────

export const discountProductSchema = {
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

export const discountResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    outletId: { type: 'string' },
    name: { type: 'string' },
    code: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
    scope: { type: 'string', enum: ['PER_ITEM', 'PER_BILL'] },
    value: { type: 'number' },
    minPurchase: { type: 'number', nullable: true },
    maxDiscount: { type: 'number', nullable: true },
    isActive: { type: 'boolean' },
    startAt: { type: 'string', format: 'date-time', nullable: true },
    endAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    products: { type: 'array', items: discountProductSchema },
    _count: { type: 'object', additionalProperties: true },
  },
}
