import { outletRepository } from './outlet.repository'
import type {
  UpdateOutletInput, UpdateSettingsInput,
  UpdateBusinessHoursInput, UpdateSingleBusinessHourInput,
} from './outlet.schema'
import { NotFoundError } from '../../shared/errors'

// ─── Day name helper (reused by controller response) ─────────────────────────

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const

function enrichBusinessHour<T extends { dayOfWeek: number }>(bh: T) {
  return { ...bh, dayName: DAY_NAMES[bh.dayOfWeek] ?? 'Unknown' }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const outletService = {
  // ── Profile ────────────────────────────────────────────────────────────────

  async getById(outletId: string) {
    const outlet = await outletRepository.findWithDetails(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')
    return {
      ...outlet,
      businessHours: (outlet.businessHours ?? []).map(enrichBusinessHour),
    }
  },

  async updateProfile(outletId: string, input: UpdateOutletInput) {
    const outlet = await outletRepository.findById(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')
    return outletRepository.update(outletId, input)
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  async getSettings(outletId: string) {
    const outlet = await outletRepository.findById(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')

    const settings = await outletRepository.findSettings(outletId)
    // Return defaults if settings row not yet created
    if (!settings) {
      return {
        outletId, taxRate: 0, taxName: 'PPN', serviceCharge: 0,
        rounding: 'NONE', roundingValue: 0,
        receiptFooter: null, receiptLogoUrl: null,
        currency: 'IDR', timezone: 'Asia/Jakarta',
      }
    }
    return settings
  },

  async updateSettings(outletId: string, input: UpdateSettingsInput) {
    const outlet = await outletRepository.findById(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')
    return outletRepository.upsertSettings(outletId, input)
  },

  // ── Business hours ─────────────────────────────────────────────────────────

  async getBusinessHours(outletId: string) {
    const outlet = await outletRepository.findById(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')

    const hours = await outletRepository.findBusinessHours(outletId)
    return hours.map(enrichBusinessHour)
  },

  async updateBusinessHours(outletId: string, input: UpdateBusinessHoursInput) {
    const outlet = await outletRepository.findById(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')

    const hours = await outletRepository.replaceBusinessHours(outletId, input.hours)
    return hours.map(enrichBusinessHour)
  },

  async updateSingleBusinessHour(
    outletId: string,
    dayOfWeek: number,
    input: UpdateSingleBusinessHourInput,
  ) {
    const outlet = await outletRepository.findById(outletId)
    if (!outlet) throw new NotFoundError('Outlet', 'OUTLET_NOT_FOUND')

    const bh = await outletRepository.upsertSingleBusinessHour(outletId, dayOfWeek, input)
    return enrichBusinessHour(bh)
  },
}
