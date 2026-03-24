import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { employeeService } from './employee.service'
import {
  createEmployeeSchema, updateEmployeeSchema, listEmployeeSchema,
  setPinSchema, verifyPinSchema, createShiftSchema, updateShiftSchema, listShiftSchema,
} from './employee.schema'
import { sendSuccess, sendPaginated } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'

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

// All handlers typed as plain FastifyRequest so Fastify's route methods accept them.
// Params are accessed via request.params cast — consistent with how category/inventory modules work.
type Req = FastifyRequest
type Rep = FastifyReply

export const employeeController = {
  async list(request: Req, reply: Rep) {
    const query = validate(listEmployeeSchema, request.query)
    const result = await employeeService.list(request.user.outletId!, query)
    return sendPaginated(reply, result.data, { page: result.page, limit: result.limit, total: result.total })
  },

  async getById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const employee = await employeeService.getById(id)
    return sendSuccess(reply, employee)
  },

  async create(request: Req, reply: Rep) {
    const input = validate(createEmployeeSchema, request.body)
    const employee = await employeeService.create(input, request.user.outletId!)
    return sendSuccess(reply, employee, 'Karyawan berhasil ditambahkan', 201)
  },

  async update(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(updateEmployeeSchema, request.body)
    const employee = await employeeService.update(id, input)
    return sendSuccess(reply, employee, 'Karyawan berhasil diperbarui')
  },

  async delete(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await employeeService.delete(id)
    return sendSuccess(reply, null, 'Karyawan berhasil dihapus')
  },

  async setPin(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(setPinSchema, request.body)
    const result = await employeeService.setPin(id, input)
    return sendSuccess(reply, result)
  },

  async removePin(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const result = await employeeService.removePin(id)
    return sendSuccess(reply, result)
  },

  async verifyPin(request: Req, reply: Rep) {
    const input = validate(verifyPinSchema, request.body)
    const employee = await employeeService.verifyPin(input)
    return sendSuccess(reply, employee, 'PIN valid')
  },

  async listShifts(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const query = validate(listShiftSchema, request.query)
    const shifts = await employeeService.listShifts(id, query)
    return sendSuccess(reply, shifts)
  },

  async createShift(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(createShiftSchema, request.body)
    const shift = await employeeService.createShift(id, input)
    return sendSuccess(reply, shift, 'Shift berhasil ditambahkan', 201)
  },

  async updateShift(request: Req, reply: Rep) {
    const { shiftId } = request.params as { id: string; shiftId: string }
    const input = validate(updateShiftSchema, request.body)
    const shift = await employeeService.updateShift(shiftId, input)
    return sendSuccess(reply, shift, 'Shift berhasil diperbarui')
  },

  async deleteShift(request: Req, reply: Rep) {
    const { shiftId } = request.params as { id: string; shiftId: string }
    await employeeService.deleteShift(shiftId)
    return sendSuccess(reply, null, 'Shift berhasil dihapus')
  },
}
