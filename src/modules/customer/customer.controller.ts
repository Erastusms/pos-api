import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { customerService } from './customer.service'
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
  upsertLoyaltyProgramSchema,
  adjustPointsSchema,
  redeemPointsSchema,
  listLoyaltyTxQuerySchema,
} from './customer.schema'
import { sendSuccess, sendPaginated } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'

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

export const customerController = {
  // ── Customer CRUD ──────────────────────────────────────────────────────────

  async list(request: Req, reply: Rep) {
    const query = validate(listCustomerQuerySchema, request.query)
    const outletId = request.user.outletId ?? ''
    const result = await customerService.list(outletId, query)
    return sendPaginated(reply, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  },

  async getById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const data = await customerService.getById(id)
    return sendSuccess(reply, data)
  },

  async create(request: Req, reply: Rep) {
    const input = validate(createCustomerSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await customerService.create(input, outletId)
    return sendSuccess(reply, data, 'Customer berhasil ditambahkan', 201)
  },

  async update(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(updateCustomerSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await customerService.update(id, input, outletId)
    return sendSuccess(reply, data, 'Customer berhasil diperbarui')
  },

  async delete(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await customerService.delete(id)
    return sendSuccess(reply, null, 'Customer berhasil dihapus')
  },

  // ── Riwayat transaksi ──────────────────────────────────────────────────────

  async getOrderHistory(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const query = request.query as { page?: string; limit?: string; status?: string }
    const result = await customerService.getOrderHistory(id, query)
    return sendPaginated(reply, result.data, result.meta)
  },

  // ── Loyalty ────────────────────────────────────────────────────────────────

  async getPointSummary(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const outletId = request.user.outletId ?? ''
    const data = await customerService.getPointSummary(id, outletId)
    return sendSuccess(reply, data)
  },

  async getLoyaltyTransactions(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const query = validate(listLoyaltyTxQuerySchema, request.query)
    const result = await customerService.getLoyaltyTransactions(id, query)
    return sendPaginated(reply, result.data, result.meta)
  },

  async previewEarnPoints(request: Req, reply: Rep) {
    const outletId = request.user.outletId ?? ''
    const { amount } = request.query as { amount?: string }

    const parsed = parseFloat(amount ?? '0')
    if (isNaN(parsed) || parsed <= 0) {
      throw new ValidationError('Validasi input gagal', [
        { field: 'amount', message: 'amount harus berupa angka positif' },
      ])
    }

    const data = await customerService.previewEarnPoints(parsed, outletId)
    return sendSuccess(reply, data)
  },

  async earnPoints(request: Req, reply: Rep) {
    const earnSchema = z.object({
      customerId: z.string().cuid('Format customer ID tidak valid'),
      orderId: z.string().cuid('Format order ID tidak valid'),
      amount: z.number().positive('Amount harus lebih dari 0'),
    })
    const input = validate(earnSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await customerService.earnPoints(
      input.customerId,
      outletId,
      input.orderId,
      input.amount,
    )
    return sendSuccess(reply, data, 'Poin berhasil ditambahkan')
  },

  async redeemPoints(request: Req, reply: Rep) {
    const input = validate(redeemPointsSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await customerService.redeemPoints(input, outletId)
    return sendSuccess(reply, data, `Berhasil redeem ${input.points} poin`)
  },

  async adjustPoints(request: Req, reply: Rep) {
    const input = validate(adjustPointsSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await customerService.adjustPoints(input, outletId)
    return sendSuccess(reply, data, `Poin berhasil ${input.points > 0 ? 'ditambah' : 'dikurangi'}`)
  },

  // ── Loyalty Program ────────────────────────────────────────────────────────

  async getLoyaltyProgram(request: Req, reply: Rep) {
    const outletId = request.user.outletId ?? ''
    const data = await customerService.getLoyaltyProgram(outletId)
    return sendSuccess(reply, data)
  },

  async upsertLoyaltyProgram(request: Req, reply: Rep) {
    const input = validate(upsertLoyaltyProgramSchema, request.body)
    const outletId = request.user.outletId ?? ''
    const data = await customerService.upsertLoyaltyProgram(input, outletId)
    return sendSuccess(reply, data, 'Program loyalitas berhasil disimpan')
  },
}
