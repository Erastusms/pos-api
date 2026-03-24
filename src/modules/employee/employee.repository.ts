import { prisma } from '../../infrastructure/database/prisma.client'
import type { CreateEmployeeInput, UpdateEmployeeInput, ListEmployeeQuery } from './employee.schema'
import { parsePagination } from '../../shared/utils/pagination'

// ─── Shared select shapes ─────────────────────────────────────────────────────

const employeeSelect = {
  id: true, name: true, email: true, phone: true,
  position: true, employmentStatus: true,
  hireDate: true, salary: true, notes: true,
  outletId: true, createdAt: true, updatedAt: true,
  // never expose pin
} as const

const shiftSelect = {
  id: true, employeeId: true, date: true,
  startTime: true, endTime: true, type: true,
  notes: true, createdAt: true, updatedAt: true,
} as const

export type EmployeeRow = {
  id: string; name: string; email: string | null; phone: string | null
  position: string; employmentStatus: string; hireDate: Date; salary: unknown
  notes: string | null; outletId: string; createdAt: Date; updatedAt: Date
}

export type ShiftRow = {
  id: string; employeeId: string; date: Date; startTime: string
  endTime: string; type: string; notes: string | null
  createdAt: Date; updatedAt: Date
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const employeeRepository = {
  // ── Employee CRUD ─────────────────────────────────────────────────────────

  async findMany(outletId: string, query: ListEmployeeQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const where = {
      outletId,
      deletedAt: null,
      ...(query.employmentStatus ? { employmentStatus: query.employmentStatus } : {}),
      ...(query.position ? { position: { contains: query.position, mode: 'insensitive' as const } } : {}),
      ...(query.search
        ? {
            OR: [
              { name:     { contains: query.search, mode: 'insensitive' as const } },
              { email:    { contains: query.search, mode: 'insensitive' as const } },
              { phone:    { contains: query.search, mode: 'insensitive' as const } },
              { position: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.employee.findMany({ where, select: employeeSelect, skip, take, orderBy: { name: 'asc' } }),
      prisma.employee.count({ where }),
    ])

    return { data, total, page, limit }
  },

  findById(id: string): Promise<EmployeeRow | null> {
    return prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: employeeSelect,
    }) as Promise<EmployeeRow | null>
  },

  findByIdWithPin(id: string) {
    return prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: { ...employeeSelect, pin: true },
    })
  },

  create(data: CreateEmployeeInput & { outletId: string }) {
    return prisma.employee.create({
      data: {
        name:             data.name,
        email:            data.email,
        phone:            data.phone,
        position:         data.position,
        hireDate:         new Date(data.hireDate),
        salary:           data.salary,
        notes:            data.notes,
        employmentStatus: data.employmentStatus,
        outletId:         data.outletId,
      },
      select: employeeSelect,
    }) as Promise<EmployeeRow>
  },

  update(id: string, data: UpdateEmployeeInput) {
    return prisma.employee.update({
      where: { id },
      data: {
        ...data,
        ...(data.hireDate ? { hireDate: new Date(data.hireDate) } : {}),
      },
      select: employeeSelect,
    }) as Promise<EmployeeRow>
  },

  softDelete(id: string) {
    return prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: employeeSelect,
    })
  },

  // ── PIN ───────────────────────────────────────────────────────────────────

  updatePin(id: string, hashedPin: string) {
    return prisma.employee.update({
      where: { id },
      data: { pin: hashedPin },
      select: { id: true },
    })
  },

  removePin(id: string) {
    return prisma.employee.update({
      where: { id },
      data: { pin: null },
      select: { id: true },
    })
  },

  // ── Shifts ────────────────────────────────────────────────────────────────

  findShiftsByEmployee(
    employeeId: string,
    filter: { startDate?: Date; endDate?: Date },
  ): Promise<ShiftRow[]> {
    return prisma.shift.findMany({
      where: {
        employeeId,
        ...(filter.startDate || filter.endDate
          ? {
              date: {
                ...(filter.startDate ? { gte: filter.startDate } : {}),
                ...(filter.endDate   ? { lte: filter.endDate   } : {}),
              },
            }
          : {}),
      },
      select: shiftSelect,
      orderBy: { date: 'asc' },
    }) as Promise<ShiftRow[]>
  },

  findShiftById(id: string): Promise<ShiftRow | null> {
    return prisma.shift.findUnique({
      where: { id },
      select: shiftSelect,
    }) as Promise<ShiftRow | null>
  },

  findShiftByEmployeeAndDate(employeeId: string, date: Date): Promise<ShiftRow | null> {
    return prisma.shift.findUnique({
      where: { employeeId_date: { employeeId, date } },
      select: shiftSelect,
    }) as Promise<ShiftRow | null>
  },

  createShift(data: { employeeId: string; date: Date; startTime: string; endTime: string; type: string; notes?: string }) {
    return prisma.shift.create({
      data,
      select: shiftSelect,
    }) as Promise<ShiftRow>
  },

  updateShift(id: string, data: Partial<{ date: Date; startTime: string; endTime: string; type: string; notes: string | null }>) {
    return prisma.shift.update({
      where: { id },
      data,
      select: shiftSelect,
    }) as Promise<ShiftRow>
  },

  deleteShift(id: string) {
    return prisma.shift.delete({ where: { id } })
  },
}
