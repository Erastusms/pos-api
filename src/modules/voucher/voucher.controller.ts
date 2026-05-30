import type { FastifyRequest, FastifyReply } from 'fastify'
import type { z } from 'zod'
import { voucherService } from './voucher.service'
import {
  createVoucherSchema,
  updateVoucherSchema,
  listVoucherQuerySchema,
  validateVoucherSchema,
  applyVoucherToCartSchema,
  autoApplyQuerySchema,
  listRedemptionQuerySchema,
} from './voucher.schema'
import { sendSuccess, sendPaginated } from '../../shared/utils/response'
import { ValidationError, BadRequestError } from '../../shared/errors'

// ─── Reuse same validate pattern dari modul lain ──────────────────────────────

function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
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
  return result.data
}

type Req = FastifyRequest
type Rep = FastifyReply

// ─── Controller ───────────────────────────────────────────────────────────────

export const voucherController = {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(request: Req, reply: Rep) {
    const query = validate(listVoucherQuerySchema, request.query)
    const outletId = request.user.outletId ?? ''
    const result = await voucherService.list(outletId, query)
    return sendPaginated(reply, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  },

  async getById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    return sendSuccess(reply, await voucherService.getById(id))
  },

  async create(request: Req, reply: Rep) {
    const input = validate(createVoucherSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await voucherService.create(input, outletId)
    return sendSuccess(reply, data, 'Voucher berhasil dibuat', 201)
  },

  async update(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(updateVoucherSchema, request.body)
    const outletId = request.user.outletId ?? ''
    return sendSuccess(
      reply,
      await voucherService.update(id, input, outletId),
      'Voucher berhasil diperbarui',
    )
  },

  async delete(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await voucherService.delete(id)
    return sendSuccess(reply, null, 'Voucher berhasil dihapus')
  },

  // ── Validate ──────────────────────────────────────────────────────────────

  async validate(request: Req, reply: Rep) {
    const input = validate(validateVoucherSchema, request.body)
    const outletId = request.user.outletId ?? ''
    return sendSuccess(reply, await voucherService.validate(input, outletId))
  },

  // ── Auto-apply ─────────────────────────────────────────────────────────────

  async getAutoApply(request: Req, reply: Rep) {
    const query = validate(autoApplyQuerySchema, request.query)
    const outletId = request.user.outletId ?? ''
    return sendSuccess(reply, await voucherService.getAutoApply(outletId, query))
  },

  // ── Apply / remove from cart ───────────────────────────────────────────────

  async applyToCart(request: Req, reply: Rep) {
    const { cartId } = request.params as { cartId: string }
    const input = validate(applyVoucherToCartSchema, request.body)
    const outletId = request.user.outletId ?? ''

    // Pass customerId dari JWT jika tersedia
    const customerId = (request.body as Record<string, unknown>)['customerId'] as string | undefined

    const voucher = await voucherService.applyToCart(cartId, { ...input, customerId }, outletId)
    return sendSuccess(reply, voucher, `Voucher "${voucher.name}" berhasil diterapkan`)
  },

  async removeFromCart(request: Req, reply: Rep) {
    const { cartId } = request.params as { cartId: string }

    // Pastikan cart ada dan punya voucher
    const { prisma } = await import('../../infrastructure/database/prisma.client')
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      select: { voucherId: true, status: true },
    })
    if (!cart) {
      throw new BadRequestError('Cart tidak ditemukan', 'CART_NOT_FOUND')
    }
    if (cart.status !== 'ACTIVE') {
      throw new BadRequestError('Cart sudah tidak aktif', 'CART_NOT_ACTIVE')
    }
    if (!cart.voucherId) {
      throw new BadRequestError(
        'Cart tidak memiliki voucher yang diterapkan',
        'VOUCHER_NOT_APPLIED',
      )
    }

    await voucherService.removeFromCart(cartId)
    return sendSuccess(reply, null, 'Voucher berhasil dilepas dari cart')
  },

  // ── Redemptions ────────────────────────────────────────────────────────────

  async getRedemptions(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const query = validate(listRedemptionQuerySchema, request.query)
    const result = await voucherService.getRedemptions(id, query)
    return sendPaginated(reply, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  },
}
