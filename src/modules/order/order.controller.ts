import type { FastifyRequest, FastifyReply } from 'fastify'
import type { z } from 'zod'
import { orderService } from './order.service'
import { createOrderSchema, voidOrderSchema, listOrderQuerySchema } from './order.schema'
import { sendSuccess, sendPaginated } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'

// ─── Reuse same validate pattern dari modul lain ──────────────────────────────

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

export const orderController = {
  /**
   * GET /orders
   * List order dengan filter dan pagination.
   */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = validateBody<z.infer<typeof listOrderQuerySchema>>(
      listOrderQuerySchema,
      request.query,
    )
    const outletId = request.user.outletId ?? ''
    const result = await orderService.list(outletId, query)
    return sendPaginated(reply, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  },

  /**
   * GET /orders/:id
   * Detail satu order.
   */
  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await orderService.getById(id)
    return sendSuccess(reply, data)
  },

  /**
   * POST /orders
   * Buat order dari cart (checkout).
   * Protected: cart harus ACTIVE, belum di-checkout sebelumnya.
   */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody<z.infer<typeof createOrderSchema>>(createOrderSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const userId = request.user.id
    const data = await orderService.createFromCart(input, outletId, userId)
    return sendSuccess(reply, data, 'Order berhasil dibuat', 201)
  },

  /**
   * POST /orders/:id/void
   * Void order PENDING (siapa saja) atau PAID (Manager/Owner only).
   * Inventory dikembalikan.
   */
  async void(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input = validateBody<z.infer<typeof voidOrderSchema>>(voidOrderSchema, request.body)
    const userId = request.user.id
    const roleId = request.user.roleId as number
    const data = await orderService.voidOrder(id, input, userId, roleId)
    return sendSuccess(reply, data, 'Order berhasil di-void')
  },

  /**
   * POST /orders/:id/complete
   * Tandai order PAID → DONE.
   */
  async complete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await orderService.completeOrder(id)
    return sendSuccess(reply, data, 'Order berhasil diselesaikan')
  },
}
