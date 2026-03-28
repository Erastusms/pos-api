import { prisma } from '../../infrastructure/database/prisma.client'
import type { UpdateOutletInput, UpdateSettingsInput } from './outlet.schema'

// ─── Select shapes ────────────────────────────────────────────────────────────

const outletSelect = {
  id: true, name: true, address: true, phone: true,
  email: true, taxNumber: true, isActive: true,
  createdAt: true, updatedAt: true,
} as const

const settingsSelect = {
  id: true, outletId: true,
  taxRate: true, taxName: true, serviceCharge: true,
  rounding: true, roundingValue: true,
  receiptFooter: true, receiptLogoUrl: true,
  currency: true, timezone: true, updatedAt: true,
} as const

const businessHourSelect = {
  id: true, outletId: true, dayOfWeek: true,
  isOpen: true, openTime: true, closeTime: true,
  updatedAt: true,
} as const

// ─── Repository ───────────────────────────────────────────────────────────────

export const outletRepository = {
  // ── Profile ────────────────────────────────────────────────────────────────

  findById(id: string) {
    return prisma.outlet.findFirst({
      where: { id, deletedAt: null },
      select: outletSelect,
    })
  },

  findWithDetails(id: string) {
    return prisma.outlet.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...outletSelect,
        settings:      { select: settingsSelect },
        businessHours: { select: businessHourSelect, orderBy: { dayOfWeek: 'asc' } },
        _count: { select: { users: true, employees: true, products: true } },
      },
    })
  },

  update(id: string, data: UpdateOutletInput) {
    return prisma.outlet.update({
      where: { id },
      data,
      select: outletSelect,
    })
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  findSettings(outletId: string) {
    return prisma.outletSettings.findUnique({
      where: { outletId },
      select: settingsSelect,
    })
  },

  /**
   * Upsert settings — creates default row if it does not exist yet.
   */
  upsertSettings(outletId: string, data: UpdateSettingsInput) {
    return prisma.outletSettings.upsert({
      where: { outletId },
      create: { outletId, ...data },
      update: data,
      select: settingsSelect,
    })
  },

  // ── Business hours ─────────────────────────────────────────────────────────

  findBusinessHours(outletId: string) {
    return prisma.outletBusinessHour.findMany({
      where: { outletId },
      select: businessHourSelect,
      orderBy: { dayOfWeek: 'asc' },
    })
  },

  /**
   * Replace all 7 business hour rows for an outlet atomically.
   */
  async replaceBusinessHours(
    outletId: string,
    hours: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prisma.$transaction(async (tx: any) => {
      await tx.outletBusinessHour.deleteMany({ where: { outletId } })
      await tx.outletBusinessHour.createMany({
        data: hours.map((h) => ({ ...h, outletId })),
      })
      return tx.outletBusinessHour.findMany({
        where: { outletId },
        select: businessHourSelect,
        orderBy: { dayOfWeek: 'asc' },
      })
    })
  },

  upsertSingleBusinessHour(
    outletId: string,
    dayOfWeek: number,
    data: { isOpen?: boolean; openTime?: string; closeTime?: string },
  ) {
    return prisma.outletBusinessHour.upsert({
      where: { outletId_dayOfWeek: { outletId, dayOfWeek } },
      create: {
        outletId,
        dayOfWeek,
        isOpen:    data.isOpen    ?? true,
        openTime:  data.openTime  ?? '08:00',
        closeTime: data.closeTime ?? '22:00',
      },
      update: data,
      select: businessHourSelect,
    })
  },
}
