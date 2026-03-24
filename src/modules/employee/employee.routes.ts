import type { FastifyInstance } from 'fastify'
import { employeeController } from './employee.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const auth = [authenticate]
const can = (action: string) => [authenticate, authorize(RESOURCES.EMPLOYEE, action as never)]

// ─── Reusable response schemas ─────────────────────────────────────────────────

const employeeShape = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' }, name: { type: 'string' },
    position: { type: 'string' }, employmentStatus: { type: 'string' },
    hireDate: { type: 'string' }, outletId: { type: 'string' },
  },
}

const shiftShape = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' }, employeeId: { type: 'string' },
    date: { type: 'string' }, startTime: { type: 'string' }, endTime: { type: 'string' },
    type: { type: 'string' },
  },
}

const ok = (data: object, msg = 'Berhasil') => ({
  type: 'object',
  properties: {
    success: { type: 'boolean' }, message: { type: 'string', example: msg }, data,
  },
})

const err = (desc: string) => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'object', additionalProperties: true,
      properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function employeeRoutes(app: FastifyInstance) {
  const T = ['Employee']

  // ── CRUD ────────────────────────────────────────────────────────────────────
  app.get('/', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: T, summary: 'Daftar karyawan',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:             { type: 'string', example: '1' },
          limit:            { type: 'string', example: '20' },
          search:           { type: 'string' },
          employmentStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'] },
          position:         { type: 'string' },
        },
      },
    },
  }, employeeController.list)

  app.get('/:id', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: T, summary: 'Detail karyawan',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 200: ok(employeeShape), 404: err('Karyawan tidak ditemukan') },
    },
  }, employeeController.getById)

  app.post('/', {
    preHandler: can(ACTIONS.CREATE),
    schema: {
      tags: T, summary: 'Tambah karyawan baru',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['name', 'position', 'hireDate'],
        properties: {
          name:             { type: 'string', example: 'Andi Wijaya' },
          email:            { type: 'string', format: 'email' },
          phone:            { type: 'string', example: '081234567890' },
          position:         { type: 'string', example: 'Kasir' },
          hireDate:         { type: 'string', example: '2024-01-15' },
          salary:           { type: 'number', example: 4000000 },
          notes:            { type: 'string' },
          employmentStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'] },
        },
      },
      response: { 201: ok(employeeShape, 'Karyawan berhasil ditambahkan'), 422: err('Validasi gagal') },
    },
  }, employeeController.create)

  app.patch('/:id', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Update karyawan',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, employeeController.update)

  app.delete('/:id', {
    preHandler: can(ACTIONS.DELETE),
    schema: {
      tags: T, summary: 'Hapus karyawan (soft delete)',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, employeeController.delete)

  // ── PIN ─────────────────────────────────────────────────────────────────────
  app.put('/:id/pin', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Set / ganti PIN karyawan',
      description: 'PIN 6 digit untuk login cepat di terminal POS.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object', required: ['pin'],
        properties: { pin: { type: 'string', minLength: 6, maxLength: 6, example: '123456' } },
      },
    },
  }, employeeController.setPin)

  app.delete('/:id/pin', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Hapus PIN karyawan',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, employeeController.removePin)

  app.post('/verify-pin', {
    preHandler: auth,
    schema: {
      tags: T, summary: 'Verifikasi PIN karyawan',
      description: 'Digunakan saat kasir mau membuka/login di terminal POS.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['employeeId', 'pin'],
        properties: {
          employeeId: { type: 'string' },
          pin:        { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
      response: {
        200: ok(employeeShape, 'PIN valid'),
        400: err('PIN tidak valid'),
      },
    },
  }, employeeController.verifyPin)

  // ── Shifts ──────────────────────────────────────────────────────────────────
  app.get('/:id/shifts', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: T, summary: 'Jadwal shift karyawan',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          month:     { type: 'string', example: '2024-10', description: 'Format YYYY-MM' },
          startDate: { type: 'string', example: '2024-10-01' },
          endDate:   { type: 'string', example: '2024-10-31' },
        },
      },
    },
  }, employeeController.listShifts)

  app.post('/:id/shifts', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Tambah jadwal shift',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object', required: ['date', 'startTime', 'endTime'],
        properties: {
          date:      { type: 'string', example: '2024-10-15' },
          startTime: { type: 'string', example: '08:00' },
          endTime:   { type: 'string', example: '16:00' },
          type:      { type: 'string', enum: ['MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY', 'CUSTOM'] },
          notes:     { type: 'string' },
        },
      },
      response: { 201: ok(shiftShape, 'Shift berhasil ditambahkan'), 409: err('Konflik jadwal') },
    },
  }, employeeController.createShift)

  app.patch('/:id/shifts/:shiftId', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Update jadwal shift',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' }, shiftId: { type: 'string' } },
      },
    },
  }, employeeController.updateShift)

  app.delete('/:id/shifts/:shiftId', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Hapus jadwal shift',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' }, shiftId: { type: 'string' } },
      },
    },
  }, employeeController.deleteShift)
}
