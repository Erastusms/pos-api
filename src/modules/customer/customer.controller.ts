import type { FastifyRequest, FastifyReply } from 'fastify'

import { customerService } from './customer.service'
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
} from './customer.schema'

import { sendSuccess } from '../../shared/utils/response'

// All handlers typed as plain FastifyRequest so Fastify's route methods accept them.
// Params are accessed via request.params cast — consistent with how category/inventory modules work.
type Req = FastifyRequest
type Rep = FastifyReply

export const customerController = {
  async getList(request: Req, reply: Rep) {
    const query = listCustomerQuerySchema.parse(request.query)
    const outletId = request.user.outletId || ''
    const customers = await customerService.list(outletId, query.search)

    return sendSuccess(reply, {
      message: 'Customer list fetched successfully',
      data: customers,
    })
  },

  async getById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const customer = await customerService.getById(id)

    return sendSuccess(reply, {
      message: 'Customer detail fetched successfully',
      data: customer,
    })
  },

  async create(request: Req, reply: Rep) {
    const body = createCustomerSchema.parse(request.body)
    const outletId = request.user.outletId || ''
    const customer = await customerService.create(body, outletId)
    return sendSuccess(reply, customer, 'Customer berhasil ditambahkan', 201)
  },

  async update(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const body = updateCustomerSchema.parse(request.body)
    const customer = await customerService.update(id, body)
    return sendSuccess(reply, customer, 'Customer berhasil diperbarui')
  },

  async delete(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await customerService.delete(id)

    return sendSuccess(reply, null, 'Customer berhasil dihapus')
  },
}
