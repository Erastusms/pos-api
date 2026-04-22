import { z } from 'zod'

// ─── Bank enum ────────────────────────────────────────────────────────────────

export const supportedBankEnum = z.enum(['bca', 'bni', 'bri', 'permata', 'mandiri'])
export type SupportedBank = z.infer<typeof supportedBankEnum>

// ─── Create payment (generate VA) ────────────────────────────────────────────

export const createPaymentSchema = z.object({
  orderId:  z
    .string({ required_error: 'Order ID wajib diisi' })
    .cuid('Format order ID tidak valid'),
  bankName: supportedBankEnum,
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>

// ─── Change method ────────────────────────────────────────────────────────────

export const changePaymentMethodSchema = z.object({
  bankName: supportedBankEnum,
})

export type ChangePaymentMethodInput = z.infer<typeof changePaymentMethodSchema>

// ─── Midtrans webhook notification ───────────────────────────────────────────
// Tidak di-validate dengan Zod — langsung diproses setelah verifikasi signature

// ─── Response schemas (for Swagger) ──────────────────────────────────────────

export const paymentResponseSchema = {
  type: 'object',
  properties: {
    id:                    { type: 'string' },
    orderId:               { type: 'string' },
    outletId:              { type: 'string' },
    midtransOrderId:       { type: 'string' },
    midtransTransactionId: { type: 'string', nullable: true },
    paymentType:           { type: 'string', example: 'bank_transfer' },
    bankName:              { type: 'string', enum: ['bca','bni','bri','permata','mandiri'] },
    vaNumber:              { type: 'string', nullable: true, description: 'Nomor Virtual Account' },
    grossAmount:           { type: 'number' },
    status: {
      type: 'string',
      enum: ['PENDING','SETTLEMENT','EXPIRED','CANCELLED','FAILED'],
    },
    midtransTransactionTime: { type: 'string', format: 'date-time', nullable: true },
    midtransSettlementTime:  { type: 'string', format: 'date-time', nullable: true },
    midtransExpireTime:      { type: 'string', format: 'date-time', nullable: true },
    paidAt:    { type: 'string', format: 'date-time', nullable: true },
    expiredAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}
