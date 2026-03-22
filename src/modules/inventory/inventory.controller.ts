import type { FastifyRequest, FastifyReply } from 'fastify'
import { inventoryService } from './inventory.service'
import {
  setInitialStockSchema,
  adjustStockSchema,
  listInventoryQuerySchema,
  historyQuerySchema,
  cogsPreviewSchema,
} from './inventory.schema'
import { sendSuccess } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'
import { z } from 'zod'

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

export const inventoryController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query    = validateBody<z.infer<typeof listInventoryQuerySchema>>(listInventoryQuerySchema, request.query)
    const outletId = request.user.outletId ?? ''
    const result   = await inventoryService.list(outletId, query)
    return reply.status(200).send({ success: true, ...result })
  },

  async getByProductId(request: FastifyRequest, reply: FastifyReply) {
    const { productId } = request.params as { productId: string }
    const data = await inventoryService.getByProductId(productId)
    return sendSuccess(reply, data)
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data   = await inventoryService.getById(id)
    return sendSuccess(reply, data)
  },

  async setInitialStock(request: FastifyRequest, reply: FastifyReply) {
    const input    = validateBody<z.infer<typeof setInitialStockSchema>>(setInitialStockSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const userId   = request.user.id
    const data     = await inventoryService.setInitialStock(input, outletId, userId)
    return sendSuccess(reply, data, 'Stok awal berhasil diset', 201)
  },

  async adjustStock(request: FastifyRequest, reply: FastifyReply) {
    const input    = validateBody<z.infer<typeof adjustStockSchema>>(adjustStockSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const userId   = request.user.id
    const data     = await inventoryService.adjustStock(input, outletId, userId)
    return sendSuccess(reply, data, 'Stok berhasil disesuaikan')
  },

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const query  = validateBody<z.infer<typeof historyQuerySchema>>(historyQuerySchema, request.query)
    const result = await inventoryService.getHistory(id, query)
    return reply.status(200).send({ success: true, ...result })
  },

  async previewCogs(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const input  = validateBody<z.infer<typeof cogsPreviewSchema>>(cogsPreviewSchema, request.body)
    const data   = await inventoryService.previewCogs(id, input)
    return sendSuccess(reply, data)
  },
}
