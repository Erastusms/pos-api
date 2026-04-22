import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { paymentService } from './payment.service'
import {
  createPaymentSchema,
  changePaymentMethodSchema,
} from './payment.schema'
import { sendSuccess } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'
import type { MidtransNotification } from './midtrans.client'

// ─── Reuse same validate pattern dari modul lain ──────────────────────────────

function validateBody<T>(schema: z.ZodTypeAny, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(
      'Validasi input gagal',
      result.error.errors.map((e) => ({
        field:   e.path.join('.') || 'body',
        message: e.message,
      })),
    )
  }
  return result.data as T
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const paymentController = {

  /**
   * GET /payments/orders/:orderId
   * Ambil data payment untuk satu order.
   */
  async getByOrderId(request: FastifyRequest, reply: FastifyReply) {
    const { orderId } = request.params as { orderId: string }
    const outletId    = request.user.outletId ?? ''
    const data        = await paymentService.getByOrderId(orderId, outletId)
    return sendSuccess(reply, data)
  },

  /**
   * POST /payments
   * Buat VA Bank Transfer untuk order PENDING.
   */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const input    = validateBody<z.infer<typeof createPaymentSchema>>(createPaymentSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data     = await paymentService.createBankTransfer(input, outletId)
    return sendSuccess(reply, data, 'Virtual Account berhasil dibuat', 201)
  },

  /**
   * PATCH /payments/orders/:orderId/method
   * Ganti bank Virtual Account.
   */
  async changeMethod(request: FastifyRequest, reply: FastifyReply) {
    const { orderId } = request.params as { orderId: string }
    const input       = validateBody<z.infer<typeof changePaymentMethodSchema>>(changePaymentMethodSchema, request.body)
    const outletId    = request.user.outletId ?? ''
    const data        = await paymentService.changePaymentMethod(orderId, input, outletId)
    return sendSuccess(reply, data, 'Metode pembayaran berhasil diubah')
  },

  /**
   * POST /payments/orders/:orderId/sync
   * Sinkron status payment dari Midtrans secara manual.
   * Berguna jika webhook tidak diterima.
   */
  async syncStatus(request: FastifyRequest, reply: FastifyReply) {
    const { orderId } = request.params as { orderId: string }
    const outletId    = request.user.outletId ?? ''
    const data        = await paymentService.syncStatus(orderId, outletId)
    return sendSuccess(reply, data, 'Status payment berhasil disinkronkan')
  },

  /**
   * POST /payments/callback/midtrans
   * Webhook notification dari Midtrans.
   *
   * PENTING:
   * - Endpoint ini TIDAK memerlukan autentikasi Bearer Token
   * - Keamanan dijamin dengan signature_key verification (SHA512)
   * - Midtrans mengharapkan response 200 OK — jangan throw error kecuali signature invalid
   */
  async handleMidtransCallback(request: FastifyRequest, reply: FastifyReply) {
    const notification = request.body as MidtransNotification

    const result = await paymentService.handleNotification(notification)

    // Midtrans butuh 200 OK agar tidak retry
    return reply.status(200).send({
      success:   true,
      processed: result.processed,
      message:   result.message,
    })
  },
}
