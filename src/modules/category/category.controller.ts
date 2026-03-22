import type { FastifyRequest, FastifyReply } from 'fastify'
import { categoryService } from './category.service'
import {
  createCategorySchema,
  updateCategorySchema,
  listCategoryQuerySchema,
} from './category.schema'
import { sendSuccess } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'
import { z } from 'zod'

// Reuse same validate pattern — accept ZodTypeAny to handle transform schemas
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

export const categoryController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query    = validateBody<z.infer<typeof listCategoryQuerySchema>>(listCategoryQuerySchema, request.query)
    const outletId = request.user.outletId ?? ''
    const data     = await categoryService.list(outletId, query)
    return sendSuccess(reply, data)
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data   = await categoryService.getById(id)
    return sendSuccess(reply, data)
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input    = validateBody<z.infer<typeof createCategorySchema>>(createCategorySchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data     = await categoryService.create(input, outletId)
    return sendSuccess(reply, data, 'Kategori berhasil dibuat', 201)
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id }   = request.params as { id: string }
    const input    = validateBody<z.infer<typeof updateCategorySchema>>(updateCategorySchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data     = await categoryService.update(id, input, outletId)
    return sendSuccess(reply, data, 'Kategori berhasil diperbarui')
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    await categoryService.delete(id)
    return sendSuccess(reply, null, 'Kategori berhasil dihapus')
  },
}
