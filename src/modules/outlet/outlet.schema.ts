import { z } from 'zod'

// ─── Outlet profile ───────────────────────────────────────────────────────────

export const updateOutletSchema = z.object({
  name:      z.string().min(2, 'Nama minimal 2 karakter').max(200).trim().optional(),
  address:   z.string().max(500).optional(),
  phone:     z.string().max(50).optional(),
  email:     z.string().email('Format email tidak valid').toLowerCase().trim().optional(),
  taxNumber: z.string().max(30).optional(), // NPWP
  isActive:  z.boolean().optional(),
})
export type UpdateOutletInput = z.infer<typeof updateOutletSchema>

// ─── Outlet settings ──────────────────────────────────────────────────────────

const roundingEnum = z.enum(['NONE', 'UP', 'DOWN', 'NEAREST'])

export const updateSettingsSchema = z
  .object({
    taxRate:        z.number().min(0).max(100).optional(),
    taxName:        z.string().min(1).max(50).optional(),
    serviceCharge:  z.number().min(0).max(100).optional(),
    rounding:       roundingEnum.optional(),
    roundingValue:  z.number().int().min(0).optional(),
    receiptFooter:  z.string().max(500).optional(),
    receiptLogoUrl: z.string().url('Format URL tidak valid').optional(),
    currency:       z.string().length(3, 'Format mata uang harus 3 huruf, contoh: IDR').toUpperCase().optional(),
    timezone:       z.string().min(1).max(100).optional(),
  })
  .refine(
    (d) => {
      // Jika rounding bukan NONE, roundingValue harus > 0
      if (d.rounding && d.rounding !== 'NONE' && d.roundingValue !== undefined) {
        return d.roundingValue > 0
      }
      return true
    },
    { message: 'roundingValue harus lebih dari 0 jika rounding aktif', path: ['roundingValue'] },
  )
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

// ─── Business hours ───────────────────────────────────────────────────────────

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:MM')

const businessHourItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen:    z.boolean(),
  openTime:  timeString,
  closeTime: timeString,
})

export const updateBusinessHoursSchema = z.object({
  hours: z
    .array(businessHourItemSchema)
    .min(1, 'Minimal 1 hari harus disertakan')
    .max(7, 'Maksimal 7 hari dalam seminggu')
    .refine(
      (items) => new Set(items.map((i) => i.dayOfWeek)).size === items.length,
      'Setiap hari hanya boleh muncul sekali',
    ),
})
export type UpdateBusinessHoursInput = z.infer<typeof updateBusinessHoursSchema>

export const updateSingleBusinessHourSchema = businessHourItemSchema
  .omit({ dayOfWeek: true })
  .extend({
    isOpen:    z.boolean().optional(),
    openTime:  timeString.optional(),
    closeTime: timeString.optional(),
  })
  .refine(
    (d) => { if (d.openTime && d.closeTime) return d.openTime < d.closeTime; return true },
    { message: 'Jam buka harus sebelum jam tutup', path: ['closeTime'] },
  )
export type UpdateSingleBusinessHourInput = z.infer<typeof updateSingleBusinessHourSchema>
