import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { cartService } from './cart.service'
import {
  createCartSchema,
  updateCartSchema,
  addCartItemSchema,
  updateCartItemSchema,
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
        field:   e.path.join('.') || 'body',
        message: e.message,
      })),
    )
  }
  return result.data as T
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const cartController = {
  /**
   * POST /carts
   * Buat cart baru (open bill).
   */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const input    = validateBody<z.infer<typeof createCartSchema>>(createCartSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const userId   = request.user.id
    const data     = await cartService.create(input, outletId, userId)
    return sendSuccess(reply, data, 'Cart berhasil dibuat', 201)
  },

  /**
   * GET /carts/active
   * Daftar semua cart ACTIVE milik user yang sedang login di outletnya.
   */
  async listActive(request: FastifyRequest, reply: FastifyReply) {
    const outletId = request.user.outletId ?? ''
    const userId   = request.user.id
    const data     = await cartService.listActive(userId, outletId)
    return sendSuccess(reply, data)
  },

  /**
   * GET /carts/:id
   * Detail cart lengkap beserta items & kalkulasi total.
   */
  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data   = await cartService.getById(id)
    return sendSuccess(reply, data)
  },

  /**
   * PATCH /carts/:id
   * Update catatan (notes) cart.
   */
  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input  = validateBody<z.infer<typeof updateCartSchema>>(updateCartSchema, request.body)
    const data   = await cartService.update(id, input)
    return sendSuccess(reply, data, 'Cart berhasil diperbarui')
  },

  /**
   * DELETE /carts/:id
   * Tandai cart sebagai ABANDONED (soft-delete, cart tidak dihapus dari DB).
   */
  async abandon(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data   = await cartService.abandon(id)
    return sendSuccess(reply, data, 'Cart berhasil dibatalkan')
  },

  /**
   * POST /carts/:id/items
   * Tambah produk ke cart. Setiap pemanggilan membuat line item baru.
   * Gunakan PUT /:id/items/:itemId untuk mengubah quantity.
   */
  async addItem(request: FastifyRequest, reply: FastifyReply) {
    const { id }   = request.params as { id: string }
    const input    = validateBody<z.infer<typeof addCartItemSchema>>(addCartItemSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data     = await cartService.addItem(id, input, outletId)
    return sendSuccess(reply, data, 'Item berhasil ditambahkan', 201)
  },

  /**
   * PUT /carts/:id/items/:itemId
   * Update quantity atau catatan satu line item.
   */
  async updateItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const input          = validateBody<z.infer<typeof updateCartItemSchema>>(updateCartItemSchema, request.body)
    const data           = await cartService.updateItem(id, itemId, input)
    return sendSuccess(reply, data, 'Item berhasil diperbarui')
  },

  /**
   * DELETE /carts/:id/items/:itemId
   * Hapus satu line item dari cart.
   */
  async removeItem(request: FastifyRequest, reply: FastifyReply) {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const data           = await cartService.removeItem(id, itemId)
    return sendSuccess(reply, data, 'Item berhasil dihapus')
  },

  /**
   * DELETE /carts/:id/items
   * Kosongkan semua item di cart (cart tetap ada, hanya item-nya dihapus).
   */
  async clearItems(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data   = await cartService.clearItems(id)
    return sendSuccess(reply, data, 'Semua item berhasil dihapus')
  },
}
