import { z } from 'zod'

// ─── Cart ─────────────────────────────────────────────────────────────────────

export const createCartSchema = z.object({
  notes: z.string().max(500, 'Catatan maksimal 500 karakter').optional(),
})

export type CreateCartInput = z.infer<typeof createCartSchema>

export const updateCartSchema = z.object({
  notes: z.string().max(500, 'Catatan maksimal 500 karakter').nullable().optional(),
})

export type UpdateCartInput = z.infer<typeof updateCartSchema>

// ─── Apply / remove discount ──────────────────────────────────────────────────

export const applyDiscountSchema = z
  .object({
    discountId: z.string().cuid('Format discount ID tidak valid').optional(),
    code: z.string().min(1).toUpperCase().optional(),
  })
  .refine((d) => d.discountId !== undefined || d.code !== undefined, {
    message: 'Salah satu dari discountId atau code wajib diisi',
    path: ['discountId'],
  })

export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>

// ─── Cart Items ───────────────────────────────────────────────────────────────

const modifierItemSchema = z.object({
  modifierId: z.string().cuid('Format modifier ID tidak valid'),
})

export const addCartItemSchema = z.object({
  productId: z
    .string({ required_error: 'Product ID wajib diisi' })
    .cuid('Format product ID tidak valid'),
  variantId: z.string().cuid('Format variant ID tidak valid').optional(),
  quantity: z
    .number({ required_error: 'Quantity wajib diisi' })
    .positive('Quantity harus lebih dari 0')
    .max(9999, 'Quantity maksimal 9999'),
  notes: z.string().max(500).optional(),
  modifiers: z.array(modifierItemSchema).optional().default([]),
})

export type AddCartItemInput = z.infer<typeof addCartItemSchema>

export const updateCartItemSchema = z.object({
  quantity: z
    .number()
    .positive('Quantity harus lebih dari 0')
    .max(9999, 'Quantity maksimal 9999')
    .optional(),
  notes: z.string().max(500).nullable().optional(),
})

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>

// ─── Response schemas (for Swagger) ──────────────────────────────────────────

export const cartItemModifierResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    modifierId: { type: 'string' },
    name: { type: 'string' },
    price: { type: 'number' },
  },
}

export const cartItemResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    cartId: { type: 'string' },
    productId: { type: 'string' },
    variantId: { type: 'string', nullable: true },
    quantity: { type: 'number' },
    unitPrice: { type: 'number' },
    lineTotal: { type: 'number' },
    notes: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    product: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        sku: { type: 'string' },
        primaryImageUrl: { type: 'string', nullable: true },
      },
    },
    variant: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        sku: { type: 'string' },
      },
    },
    modifiers: { type: 'array', items: cartItemModifierResponseSchema },
  },
}

export const cartSummarySchema = {
  type: 'object',
  properties: {
    itemCount: { type: 'number' },
    subtotal: { type: 'number' },
    discountAmount: { type: 'number' },
    discountedSubtotal: { type: 'number' },
    serviceChargeAmount: { type: 'number' },
    taxAmount: { type: 'number' },
    roundingAmount: { type: 'number' },
    total: { type: 'number' },
  },
}

export const appliedDiscountSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    code: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
    scope: { type: 'string', enum: ['PER_ITEM', 'PER_BILL'] },
    value: { type: 'number' },
    minPurchase: { type: 'number', nullable: true },
    maxDiscount: { type: 'number', nullable: true },
  },
}

export const cartResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    outletId: { type: 'string' },
    userId: { type: 'string' },
    discountId: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'CHECKED_OUT', 'ABANDONED'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    items: { type: 'array', items: cartItemResponseSchema },
    summary: cartSummarySchema,
    appliedDiscount: appliedDiscountSchema,
  },
}
