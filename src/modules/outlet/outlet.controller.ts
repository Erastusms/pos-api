import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { outletService } from './outlet.service'
import {
  updateOutletSchema, updateSettingsSchema,
  updateBusinessHoursSchema, updateSingleBusinessHourSchema,
} from './outlet.schema'
import { sendSuccess } from '../../shared/utils/response'
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

export const outletController = {
  // ── Profile ────────────────────────────────────────────────────────────────

  async getById(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const outlet = await outletService.getById(outletId)
    return sendSuccess(reply, outlet)
  },

  async updateProfile(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const input = validate(updateOutletSchema, request.body)
    const outlet = await outletService.updateProfile(outletId, input)
    return sendSuccess(reply, outlet, 'Profil outlet berhasil diperbarui')
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  async getSettings(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const settings = await outletService.getSettings(outletId)
    return sendSuccess(reply, settings)
  },

  async updateSettings(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const input = validate(updateSettingsSchema, request.body)
    const settings = await outletService.updateSettings(outletId, input)
    return sendSuccess(reply, settings, 'Pengaturan outlet berhasil diperbarui')
  },

  // ── Business hours ─────────────────────────────────────────────────────────

  async getBusinessHours(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const hours = await outletService.getBusinessHours(outletId)
    return sendSuccess(reply, hours)
  },

  /**
   * Replace all 7 days at once.
   */
  async updateBusinessHours(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const input = validate(updateBusinessHoursSchema, request.body)
    const hours = await outletService.updateBusinessHours(outletId, input)
    return sendSuccess(reply, hours, 'Jam operasional berhasil diperbarui')
  },

  /**
   * Update a single day by its dayOfWeek (0–6).
   */
  async updateSingleBusinessHour(request: Req, reply: Rep) {
    const outletId = request.user.outletId!
    const { day } = request.params as { day: string }
    const dayOfWeek = parseInt(day, 10)

    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new ValidationError('Validasi input gagal', [
        { field: 'day', message: 'Hari harus berupa angka 0 (Minggu) sampai 6 (Sabtu)' },
      ])
    }

    const input = validate(updateSingleBusinessHourSchema, request.body)
    const bh = await outletService.updateSingleBusinessHour(outletId, dayOfWeek, input)
    return sendSuccess(reply, bh, 'Jam operasional berhasil diperbarui')
  },
}
