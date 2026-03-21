import type { FastifyReply } from 'fastify'

// ─── Response shape types ─────────────────────────────────────────────────────

export interface SuccessResponse<T> {
  success: true
  message?: string
  data: T
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  meta: PaginationMeta
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Send a single-item success response.
 *
 * @example
 * return sendSuccess(reply, product, 'Produk berhasil dibuat', 201)
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message?: string,
  statusCode = 200,
): void {
  const body: SuccessResponse<T> = { success: true, data }
  if (message) body.message = message
  reply.status(statusCode).send(body)
}

/**
 * Send a paginated list response.
 *
 * @example
 * return sendPaginated(reply, products, { page: 1, limit: 20, total: 100 })
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  meta: Pick<PaginationMeta, 'page' | 'limit' | 'total'>,
): void {
  const totalPages = Math.ceil(meta.total / meta.limit)

  reply.status(200).send({
    success: true,
    data,
    meta: {
      ...meta,
      totalPages,
      hasNextPage: meta.page < totalPages,
      hasPrevPage: meta.page > 1,
    } satisfies PaginationMeta,
  })
}
