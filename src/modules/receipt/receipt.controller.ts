import type { FastifyRequest, FastifyReply } from 'fastify'
import { receiptService } from './receipt.service'
import { sendSuccess }    from '../../shared/utils/response'

// ─── Controller ───────────────────────────────────────────────────────────────

export const receiptController = {

  /**
   * POST /orders/:orderId/receipt
   * Enqueue generate PDF receipt untuk satu order. Idempotent.
   */
  async enqueue(request: FastifyRequest, reply: FastifyReply) {
    const { orderId } = request.params as { orderId: string }
    const outletId    = request.user.outletId ?? ''
    const data        = await receiptService.enqueue(orderId, outletId)
    return sendSuccess(reply, data, 'Receipt berhasil di-queue untuk di-generate', 202)
  },

  /**
   * GET /orders/:orderId/receipt
   * Status receipt dan URL PDF (jika sudah READY).
   */
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const { orderId } = request.params as { orderId: string }
    const outletId    = request.user.outletId ?? ''
    const data        = await receiptService.getByOrderId(orderId, outletId)
    return sendSuccess(reply, data)
  },

  /**
   * POST /orders/:orderId/receipt/regenerate
   * Reset & generate ulang receipt yang FAILED atau READY.
   */
  async regenerate(request: FastifyRequest, reply: FastifyReply) {
    const { orderId } = request.params as { orderId: string }
    const outletId    = request.user.outletId ?? ''
    const data        = await receiptService.regenerate(orderId, outletId)
    return sendSuccess(reply, data, 'Receipt akan di-generate ulang', 202)
  },
}
