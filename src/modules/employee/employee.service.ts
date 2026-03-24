import { employeeRepository } from './employee.repository'
import type {
  CreateEmployeeInput, UpdateEmployeeInput, ListEmployeeQuery,
  SetPinInput, VerifyPinInput, CreateShiftInput, UpdateShiftInput, ListShiftQuery,
} from './employee.schema'
import { hashPassword, comparePassword } from '../../shared/utils/hash'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors'

// ─── Date range helper (reused by both month and custom range) ────────────────

function resolveDateRange(query: ListShiftQuery): { startDate?: Date; endDate?: Date } {
  if (query.month) {
    const [year, month] = query.month.split('-').map(Number)
    return {
      startDate: new Date(year!, month! - 1, 1),
      endDate:   new Date(year!, month!, 0),    // last day of month
    }
  }
  return {
    startDate: query.startDate ? new Date(query.startDate) : undefined,
    endDate:   query.endDate   ? new Date(query.endDate)   : undefined,
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const employeeService = {
  // ── Employee CRUD ──────────────────────────────────────────────────────────

  async list(outletId: string, query: ListEmployeeQuery) {
    return employeeRepository.findMany(outletId, query)
  },

  async getById(id: string) {
    const employee = await employeeRepository.findById(id)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')
    return employee
  },

  async create(input: CreateEmployeeInput, outletId: string) {
    return employeeRepository.create({ ...input, outletId })
  },

  async update(id: string, input: UpdateEmployeeInput) {
    const employee = await employeeRepository.findById(id)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')
    return employeeRepository.update(id, input)
  },

  async delete(id: string) {
    const employee = await employeeRepository.findById(id)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')
    return employeeRepository.softDelete(id)
  },

  // ── PIN management ─────────────────────────────────────────────────────────

  async setPin(id: string, input: SetPinInput) {
    const employee = await employeeRepository.findById(id)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')

    const hashed = await hashPassword(input.pin)
    await employeeRepository.updatePin(id, hashed)
    return { message: 'PIN berhasil diset' }
  },

  async removePin(id: string) {
    const employee = await employeeRepository.findById(id)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')

    await employeeRepository.removePin(id)
    return { message: 'PIN berhasil dihapus' }
  },

  /**
   * Verifikasi PIN karyawan — digunakan saat kasir mau login di POS terminal.
   * Selalu jalankan bcrypt compare meski employee tidak ditemukan (anti-timing attack).
   */
  async verifyPin(input: VerifyPinInput) {
    const employee = await employeeRepository.findByIdWithPin(input.employeeId)

    const pinToCheck = employee?.pin ?? '$2b$12$invalidhashtopreventtimingattacks'
    const isMatch = await comparePassword(input.pin, pinToCheck)

    if (!employee || !isMatch) {
      throw new BadRequestError('PIN tidak valid', 'INVALID_PIN')
    }

    if (employee.employmentStatus !== 'ACTIVE') {
      throw new BadRequestError('Karyawan tidak aktif', 'EMPLOYEE_INACTIVE')
    }

    // Return employee data tanpa pin
    const { pin: _pin, ...safeEmployee } = employee
    return safeEmployee
  },

  // ── Shift management ───────────────────────────────────────────────────────

  async listShifts(employeeId: string, query: ListShiftQuery) {
    const employee = await employeeRepository.findById(employeeId)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')

    const range = resolveDateRange(query)
    return employeeRepository.findShiftsByEmployee(employeeId, range)
  },

  async createShift(employeeId: string, input: CreateShiftInput) {
    const employee = await employeeRepository.findById(employeeId)
    if (!employee) throw new NotFoundError('Karyawan', 'EMPLOYEE_NOT_FOUND')

    const date = new Date(input.date)

    // Satu shift per karyawan per hari
    const existing = await employeeRepository.findShiftByEmployeeAndDate(employeeId, date)
    if (existing) {
      throw new ConflictError(
        `Karyawan sudah memiliki shift pada tanggal ${input.date}`,
        'SHIFT_DATE_CONFLICT',
      )
    }

    return employeeRepository.createShift({
      employeeId,
      date,
      startTime: input.startTime,
      endTime:   input.endTime,
      type:      input.type,
      notes:     input.notes,
    })
  },

  async updateShift(shiftId: string, input: UpdateShiftInput) {
    const shift = await employeeRepository.findShiftById(shiftId)
    if (!shift) throw new NotFoundError('Shift', 'SHIFT_NOT_FOUND')

    // Jika tanggal berubah, cek konflik lagi
    if (input.date) {
      const newDate = new Date(input.date)
      const conflict = await employeeRepository.findShiftByEmployeeAndDate(shift.employeeId, newDate)
      if (conflict && conflict.id !== shiftId) {
        throw new ConflictError(
          `Karyawan sudah memiliki shift pada tanggal ${input.date}`,
          'SHIFT_DATE_CONFLICT',
        )
      }
    }

    return employeeRepository.updateShift(shiftId, {
      ...(input.date      ? { date:      new Date(input.date) } : {}),
      ...(input.startTime ? { startTime: input.startTime      } : {}),
      ...(input.endTime   ? { endTime:   input.endTime        } : {}),
      ...(input.type      ? { type:      input.type           } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    })
  },

  async deleteShift(shiftId: string) {
    const shift = await employeeRepository.findShiftById(shiftId)
    if (!shift) throw new NotFoundError('Shift', 'SHIFT_NOT_FOUND')
    await employeeRepository.deleteShift(shiftId)
  },
}
