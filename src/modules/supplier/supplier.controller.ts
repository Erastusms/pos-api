import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { supplierService } from './supplier.service'
import {
  createSupplierSchema, updateSupplierSchema, listSupplierSchema,
  createPurchaseOrderSchema, updatePurchaseOrderSchema,
  listPurchaseOrderSchema, receivePurchaseOrderSchema,
} from './supplier.schema'
import { sendSuccess, sendPaginated } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'

// ─── Reusable validator — same pattern across all modules ─────────────────────

function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Validasi input gagal', result.error.errors.map((e) => ({
      field: e.path.join('.') || 'body',
      message: e.message,
    })))
  }
  return result.data
}

type Req = FastifyRequest
type Rep = FastifyReply

// ─── Controllers ─────────────────────────────────────────────────────────────

export const supplierController = {
  // ── Supplier CRUD ──────────────────────────────────────────────────────────

  async list(request: Req, reply: Rep) {
    const query = validate(listSupplierSchema, request.query)
    const result = await supplierService.list(request.user.outletId!, query)
    return sendPaginated(reply, result.data, { page: result.page, limit: result.limit, total: result.total })
  },

  async getById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const supplier = await supplierService.getById(id)
    return sendSuccess(reply, supplier)
  },

  async create(request: Req, reply: Rep) {
    const input = validate(createSupplierSchema, request.body)
    const supplier = await supplierService.create(input, request.user.outletId!)
    return sendSuccess(reply, supplier, 'Supplier berhasil ditambahkan', 201)
  },

  async update(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(updateSupplierSchema, request.body)
    const supplier = await supplierService.update(id, input)
    return sendSuccess(reply, supplier, 'Supplier berhasil diperbarui')
  },

  async delete(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await supplierService.delete(id)
    return sendSuccess(reply, null, 'Supplier berhasil dihapus')
  },

  // ── Purchase Order ─────────────────────────────────────────────────────────

  async listPo(request: Req, reply: Rep) {
    const query = validate(listPurchaseOrderSchema, request.query)
    const result = await supplierService.listPo(request.user.outletId!, query)
    return sendPaginated(reply, result.data, { page: result.page, limit: result.limit, total: result.total })
  },

  async getPoById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const po = await supplierService.getPoById(id)
    return sendSuccess(reply, po)
  },

  async createPo(request: Req, reply: Rep) {
    const input = validate(createPurchaseOrderSchema, request.body)
    const po = await supplierService.createPo(
      input,
      request.user.outletId!,
      request.user.id,
    )
    return sendSuccess(reply, po, 'Purchase Order berhasil dibuat', 201)
  },

  async updatePo(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(updatePurchaseOrderSchema, request.body)
    const po = await supplierService.updatePo(id, input)
    return sendSuccess(reply, po, 'Purchase Order berhasil diperbarui')
  },

  async cancelPo(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const po = await supplierService.cancelPo(id)
    return sendSuccess(reply, po, 'Purchase Order berhasil dibatalkan')
  },

  async deletePo(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await supplierService.deletePo(id)
    return sendSuccess(reply, null, 'Purchase Order berhasil dihapus')
  },

  async receivePo(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(receivePurchaseOrderSchema, request.body)
    const po = await supplierService.receivePo(id, input)
    return sendSuccess(reply, po, 'Penerimaan barang berhasil dicatat')
  },
}
