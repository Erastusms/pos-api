import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from './AppError'
import { env } from '../../config/env'

export * from './AppError'
export * from './HttpError'

/**
 * Global Fastify error handler.
 * Registered via app.setErrorHandler() in src/config/app.ts.
 *
 * Handles:
 *  - AppError (our own operational errors)
 *  - Fastify validation errors (FST_ERR_VALIDATION)
 *  - Fastify rate limit errors (FST_ERR_RATE_LIMIT)
 *  - Zod errors (surfaced from controllers)
 *  - Prisma known request errors
 *  - Unknown / unexpected errors (safe 500 message)
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const log = request.log

  // ─── Our own operational errors ──────────────────────────────────────────
  if (error instanceof AppError) {
    if (!error.isOperational) {
      log.error({ err: error }, 'Non-operational AppError')
    }

    const body: Record<string, unknown> = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    }

    // Include field-level details for validation errors
    if ('details' in error && Array.isArray(error.details) && error.details.length > 0) {
      ;(body['error'] as Record<string, unknown>)['details'] = error.details
    }

    reply.status(error.statusCode).send(body)
    return
  }

  // ─── Fastify schema validation errors (query / body / params) ────────────
  if ('validation' in error && error.validation) {
    const details = (
      error.validation as Array<{
        instancePath: string
        message?: string
        params?: { missingProperty?: string }
      }>
    ).map((v) => ({
      // required property error → pakai params.missingProperty
      // type/format error      → pakai instancePath
      field:
        v.params?.missingProperty ??
        (v.instancePath ? v.instancePath.replace(/^\//, '') : 'unknown'),
      message: v.message ?? 'Invalid value',
    }))

    reply.status(422).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    })
    return
  }

  // ─── Fastify rate limit error ─────────────────────────────────────────────
  if ('statusCode' in error && error.statusCode === 429) {
    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Terlalu banyak permintaan. Silakan coba lagi nanti.',
      },
    })
    return
  }

  // ─── Prisma known errors ──────────────────────────────────────────────────
  if (error.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as Error & { code: string; meta?: Record<string, unknown> }

    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      const field = String((prismaError.meta?.['target'] as string[])?.join(', ') ?? 'field')
      reply.status(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: `Data sudah ada: ${field}`,
        },
      })
      return
    }

    if (prismaError.code === 'P2025') {
      // Record not found (e.g. update/delete on non-existent ID)
      reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Data tidak ditemukan',
        },
      })
      return
    }
  }

  // ─── JWT errors ───────────────────────────────────────────────────────────
  if (error.name === 'JsonWebTokenError') {
    reply.status(401).send({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token tidak valid' },
    })
    return
  }

  if (error.name === 'TokenExpiredError') {
    reply.status(401).send({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token sudah kadaluarsa' },
    })
    return
  }

  // ─── Unknown / unexpected errors ──────────────────────────────────────────
  log.error({ err: error }, 'Unhandled error')

  reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan pada server. Silakan coba lagi.',
      // Only expose stack trace in development
      ...(env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  })
}
