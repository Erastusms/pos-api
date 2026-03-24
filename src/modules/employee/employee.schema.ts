import { z } from 'zod'

const employmentStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED'])
const shiftTypeEnum = z.enum(['MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY', 'CUSTOM'])

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:MM (contoh: 08:00)')

// ─── Employee ─────────────────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  name:             z.string({ required_error: 'Nama wajib diisi' }).min(2).max(100).trim(),
  email:            z.string().email('Format email tidak valid').toLowerCase().trim().optional(),
  phone:            z.string().regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Format nomor telepon tidak valid').optional(),
  position:         z.string({ required_error: 'Jabatan wajib diisi' }).min(2).max(100).trim(),
  hireDate:         z.string({ required_error: 'Tanggal mulai kerja wajib diisi' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD'),
  salary:           z.number().min(0).optional(),
  notes:            z.string().max(500).optional(),
  employmentStatus: employmentStatusEnum.default('ACTIVE'),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export const updateEmployeeSchema = createEmployeeSchema.partial()
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>

export const listEmployeeSchema = z.object({
  page:             z.string().optional(),
  limit:            z.string().optional(),
  search:           z.string().optional(),
  employmentStatus: employmentStatusEnum.optional(),
  position:         z.string().optional(),
})
export type ListEmployeeQuery = z.infer<typeof listEmployeeSchema>

// ─── PIN ──────────────────────────────────────────────────────────────────────

export const setPinSchema = z.object({
  pin: z.string({ required_error: 'PIN wajib diisi' }).length(6, 'PIN harus tepat 6 digit').regex(/^\d{6}$/, 'PIN hanya boleh berisi angka'),
})
export type SetPinInput = z.infer<typeof setPinSchema>

export const verifyPinSchema = z.object({
  employeeId: z.string({ required_error: 'Employee ID wajib diisi' }).min(1),
  pin:        z.string({ required_error: 'PIN wajib diisi' }).length(6).regex(/^\d{6}$/),
})
export type VerifyPinInput = z.infer<typeof verifyPinSchema>

// ─── Shift — base schema WITHOUT refine so .partial() works ──────────────────

const shiftBase = z.object({
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD'),
  startTime: timeString,
  endTime:   timeString,
  type:      shiftTypeEnum.default('CUSTOM'),
  notes:     z.string().max(300).optional(),
})

// Apply cross-field validation after the base definition
export const createShiftSchema = shiftBase.refine(
  (d) => d.startTime < d.endTime,
  { message: 'Waktu mulai harus sebelum waktu selesai', path: ['endTime'] },
)
export type CreateShiftInput = z.infer<typeof createShiftSchema>

// Partial uses the BASE schema (before refine) — cross-field check only needed on full create
export const updateShiftSchema = shiftBase.partial().refine(
  (d) => { if (d.startTime && d.endTime) return d.startTime < d.endTime; return true },
  { message: 'Waktu mulai harus sebelum waktu selesai', path: ['endTime'] },
)
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>

export const listShiftSchema = z.object({
  month:     z.string().regex(/^\d{4}-\d{2}$/, 'Format bulan: YYYY-MM').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type ListShiftQuery = z.infer<typeof listShiftSchema>
