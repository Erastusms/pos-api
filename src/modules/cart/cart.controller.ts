import type { FastifyRequest, FastifyReply } from 'fastify'
import type { z } from 'zod'
import { cartService } from './cart.service'
import {
  createCartSchema,
  updateCartSchema,
  addCartItemSchema,
  updateCartItemSchema,
  applyDiscountSchema,
} from './cart.schema'
import { sendSuccess } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'

// ─── Reuse same validate pattern dari modul lain ───────────────────────────────

function validateBody<T>(schema: z.ZodTypeAny, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(
      'Validasi input gagal',
      result.error.errors.map((e) => ({
        field: e.path.join('.') || 'body',
        message: e.message,
      })),
    )
  }
  return result.data as T
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const cartController = {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody<z.infer<typeof createCartSchema>>(createCartSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const userId = request.user.id
    const data = await cartService.create(input, outletId, userId)
    return sendSuccess(reply, data, 'Cart berhasil dibuat', 201)
  },

  async listActive(request: FastifyRequest, reply: FastifyReply) {
    const outletId = request.user.outletId ?? ''
    const userId = request.user.id
    const data = await cartService.listActive(userId, outletId)
    return sendSuccess(reply, data)
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await cartService.getById(id)
    return sendSuccess(reply, data)
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input = validateBody<z.infer<typeof updateCartSchema>>(updateCartSchema, request.body)
    const data = await cartService.update(id, input)
    return sendSuccess(reply, data, 'Cart berhasil diperbarui')
  },

  async abandon(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await cartService.abandon(id)
    return sendSuccess(reply, data, 'Cart berhasil dibatalkan')
  },

  async addItem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input = validateBody<z.infer<typeof addCartItemSchema>>(addCartItemSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await cartService.addItem(id, input, outletId)
    return sendSuccess(reply, data, 'Item berhasil ditambahkan', 201)
  },

  async updateItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const input = validateBody<z.infer<typeof updateCartItemSchema>>(
      updateCartItemSchema,
      request.body,
    )
    const data = await cartService.updateItem(id, itemId, input)
    return sendSuccess(reply, data, 'Item berhasil diperbarui')
  },

  async removeItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const data = await cartService.removeItem(id, itemId)
    return sendSuccess(reply, data, 'Item berhasil dihapus')
  },

  async clearItems(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await cartService.clearItems(id)
    return sendSuccess(reply, data, 'Semua item berhasil dihapus')
  },

  /**
   * POST /carts/:id/discount
   * Terapkan diskon ke cart — by discountId atau kode promo.
   */
  async applyDiscount(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input = validateBody<z.infer<typeof applyDiscountSchema>>(
      applyDiscountSchema,
      request.body,
    )
    const outletId = request.user.outletId ?? ''
    const data = await cartService.applyDiscount(id, input, outletId)
    return sendSuccess(reply, data, 'Diskon berhasil diterapkan')
  },

  /**
   * DELETE /carts/:id/discount
   * Lepaskan diskon yang sedang diterapkan pada cart.
   */
  async removeDiscount(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await cartService.removeDiscount(id)
    return sendSuccess(reply, data, 'Diskon berhasil dilepas')
  },
}
