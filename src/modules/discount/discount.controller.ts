import type { FastifyRequest, FastifyReply } from 'fastify'
import type { z } from 'zod'
import { discountService } from './discount.service'
import {
  createDiscountSchema,
  updateDiscountSchema,
  listDiscountQuerySchema,
} from './discount.schema'
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

export const discountController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = validateBody<z.infer<typeof listDiscountQuerySchema>>(
      listDiscountQuerySchema,
      request.query,
    )
    const outletId = request.user.outletId ?? ''
    const result = await discountService.list(outletId, query)
    return sendPaginated(reply, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = await discountService.getById(id)
    return sendSuccess(reply, data)
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody<z.infer<typeof createDiscountSchema>>(
      createDiscountSchema,
      request.body,
    )
    const outletId = request.user.outletId ?? ''
    const data = await discountService.create(input, outletId)
    return sendSuccess(reply, data, 'Diskon berhasil dibuat', 201)
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input = validateBody<z.infer<typeof updateDiscountSchema>>(
      updateDiscountSchema,
      request.body,
    )
    const outletId = request.user.outletId ?? ''
    const data = await discountService.update(id, input, outletId)
    return sendSuccess(reply, data, 'Diskon berhasil diperbarui')
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    await discountService.delete(id)
    return sendSuccess(reply, null, 'Diskon berhasil dihapus')
  },
}
