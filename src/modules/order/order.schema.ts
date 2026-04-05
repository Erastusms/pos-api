import { z } from 'zod'

// ─── Order status enum ────────────────────────────────────────────────────────

export const orderStatusEnum = z.enum(['PENDING', 'PAID', 'DONE', 'VOID'])

// ─── Create order from cart ───────────────────────────────────────────────────

export const createOrderSchema = z.object({
  cartId: z
    .string({ required_error: 'Cart ID wajib diisi' })
    .cuid('Format cart ID tidak valid'),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter').optional(),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

// ─── Void order ───────────────────────────────────────────────────────────────

export const voidOrderSchema = z.object({
  reason: z
    .string({ required_error: 'Alasan void wajib diisi' })
    .min(3,  'Alasan minimal 3 karakter')
    .max(500, 'Alasan maksimal 500 karakter')
    .trim(),
})

export type VoidOrderInput = z.infer<typeof voidOrderSchema>

// ─── List query ───────────────────────────────────────────────────────────────

export const listOrderQuerySchema = z.object({
  page:      z.string().optional(),
  limit:     z.string().optional(),
  status:    orderStatusEnum.optional(),
  userId:    z.string().cuid().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate:   z.string().datetime({ offset: true }).optional(),
  search:    z.string().optional(), // cari by orderNumber
})

export type ListOrderQuery = z.infer<typeof listOrderQuerySchema>

// ─── Response schemas (for Swagger) ──────────────────────────────────────────

const orderItemModifierResponseSchema = {
  type: 'object',
  properties: {
    id:         { type: 'string' },
    modifierId: { type: 'string', nullable: true },
    name:       { type: 'string' },
    price:      { type: 'number' },
  },
}

const orderItemResponseSchema = {
  type: 'object',
  properties: {
    id:                  { type: 'string' },
    orderId:             { type: 'string' },
    productId:           { type: 'string', nullable: true },
    variantId:           { type: 'string', nullable: true },
    productName:         { type: 'string' },
    productSku:          { type: 'string' },
    variantName:         { type: 'string', nullable: true },
    quantity:            { type: 'number' },
    unitPrice:           { type: 'number' },
    itemDiscountAmount:  { type: 'number' },
    lineTotal:           { type: 'number' },
    notes:               { type: 'string', nullable: true },
    modifiers:           { type: 'array', items: orderItemModifierResponseSchema },
  },
}

const orderFinancialSchema = {
  type: 'object',
  properties: {
    subtotal:            { type: 'number' },
    discountAmount:      { type: 'number' },
    discountedSubtotal:  { type: 'number' },
    serviceChargeAmount: { type: 'number' },
    taxAmount:           { type: 'number' },
    roundingAmount:      { type: 'number' },
    total:               { type: 'number' },
  },
}

const appliedDiscountSnapshotSchema = {
  type: 'object', nullable: true,
  properties: {
    id:    { type: 'string', nullable: true },
    name:  { type: 'string', nullable: true },
    code:  { type: 'string', nullable: true },
    type:  { type: 'string', nullable: true },
    scope: { type: 'string', nullable: true },
    value: { type: 'number', nullable: true },
  },
}

export const orderResponseSchema = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    orderNumber: { type: 'string' },
    outletId:    { type: 'string' },
    userId:      { type: 'string' },
    cartId:      { type: 'string', nullable: true },
    discountId:  { type: 'string', nullable: true },
    status:      { type: 'string', enum: ['PENDING', 'PAID', 'DONE', 'VOID'] },
    notes:       { type: 'string', nullable: true },
    financial:   orderFinancialSchema,
    discount:    appliedDiscountSnapshotSchema,
    paidAt:      { type: 'string', format: 'date-time', nullable: true },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    voidedAt:    { type: 'string', format: 'date-time', nullable: true },
    voidReason:  { type: 'string', nullable: true },
    voidedById:  { type: 'string', nullable: true },
    createdAt:   { type: 'string', format: 'date-time' },
    updatedAt:   { type: 'string', format: 'date-time' },
    items:       { type: 'array', items: orderItemResponseSchema },
    cashier: {
      type: 'object',
      properties: {
        id:   { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
}
