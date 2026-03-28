import type { FastifyInstance } from 'fastify'
import { outletController } from './outlet.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const canRead   = [authenticate, authorize(RESOURCES.OUTLET, ACTIONS.READ)]
const canUpdate = [authenticate, authorize(RESOURCES.OUTLET, ACTIONS.UPDATE)]

const ok = (data: object, msg = 'Berhasil') => ({
  type: 'object',
  properties: { success: { type: 'boolean' }, message: { type: 'string', example: msg }, data },
})

const outletShape = {
  type: 'object', additionalProperties: true,
  properties: {
    id: { type: 'string' }, name: { type: 'string' },
    address: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true }, isActive: { type: 'boolean' },
  },
}

const settingsShape = {
  type: 'object', additionalProperties: true,
  properties: {
    taxRate: { type: 'number' }, taxName: { type: 'string' },
    serviceCharge: { type: 'number' }, rounding: { type: 'string' },
    roundingValue: { type: 'number' }, currency: { type: 'string' },
    timezone: { type: 'string' },
  },
}

const businessHourShape = {
  type: 'object', additionalProperties: true,
  properties: {
    dayOfWeek: { type: 'number' }, dayName: { type: 'string' },
    isOpen: { type: 'boolean' }, openTime: { type: 'string' }, closeTime: { type: 'string' },
  },
}

export async function outletRoutes(app: FastifyInstance) {
  const T = ['Outlet']

  // ── Profile ─────────────────────────────────────────────────────────────────
  app.get('/me', {
    preHandler: canRead,
    schema: {
      tags: T, summary: 'Profil outlet saya (beserta settings & jam operasional)',
      description: 'Mengambil seluruh detail outlet milik user yang sedang login — profile, settings, jam operasional, dan statistik.',
      security: [{ bearerAuth: [] }],
      response: { 200: ok(outletShape) },
    },
  }, outletController.getById)

  app.patch('/me', {
    preHandler: canUpdate,
    schema: {
      tags: T, summary: 'Update profil outlet',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name:      { type: 'string', example: 'Toko Kopi Nusantara' },
          address:   { type: 'string' },
          phone:     { type: 'string' },
          email:     { type: 'string', format: 'email' },
          taxNumber: { type: 'string', description: 'NPWP' },
          isActive:  { type: 'boolean' },
        },
      },
      response: { 200: ok(outletShape, 'Profil outlet berhasil diperbarui') },
    },
  }, outletController.updateProfile)

  // ── Settings ─────────────────────────────────────────────────────────────────
  app.get('/me/settings', {
    preHandler: canRead,
    schema: {
      tags: T, summary: 'Pengaturan outlet (pajak, rounding, struk)',
      security: [{ bearerAuth: [] }],
      response: { 200: ok(settingsShape) },
    },
  }, outletController.getSettings)

  app.patch('/me/settings', {
    preHandler: canUpdate,
    schema: {
      tags: T, summary: 'Update pengaturan outlet',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          taxRate:        { type: 'number', example: 11, description: 'PPN dalam persen (0–100)' },
          taxName:        { type: 'string', example: 'PPN' },
          serviceCharge:  { type: 'number', example: 5, description: 'Service charge dalam persen' },
          rounding:       { type: 'string', enum: ['NONE', 'UP', 'DOWN', 'NEAREST'] },
          roundingValue:  { type: 'integer', example: 100, description: 'Nilai pembulatan, e.g. 100, 500, 1000' },
          receiptFooter:  { type: 'string', example: 'Terima kasih telah berbelanja!' },
          receiptLogoUrl: { type: 'string', format: 'uri' },
          currency:       { type: 'string', example: 'IDR', description: '3 huruf ISO 4217' },
          timezone:       { type: 'string', example: 'Asia/Jakarta' },
        },
      },
      response: { 200: ok(settingsShape, 'Pengaturan berhasil diperbarui') },
    },
  }, outletController.updateSettings)

  // ── Business hours ────────────────────────────────────────────────────────────
  app.get('/me/business-hours', {
    preHandler: canRead,
    schema: {
      tags: T, summary: 'Jam operasional outlet (semua hari)',
      security: [{ bearerAuth: [] }],
      response: {
        200: ok({ type: 'array', items: businessHourShape }),
      },
    },
  }, outletController.getBusinessHours)

  app.put('/me/business-hours', {
    preHandler: canUpdate,
    schema: {
      tags: T, summary: 'Set jam operasional (semua 7 hari sekaligus)',
      description: 'Mengganti semua jam operasional dalam satu request. Semua 7 hari boleh dikirim, atau hanya hari yang ingin diubah — hari yang tidak dikirim akan dihapus.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['hours'],
        properties: {
          hours: {
            type: 'array',
            items: {
              type: 'object', required: ['dayOfWeek', 'isOpen', 'openTime', 'closeTime'],
              properties: {
                dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, description: '0=Minggu, 1=Senin, ..., 6=Sabtu' },
                isOpen:    { type: 'boolean' },
                openTime:  { type: 'string', example: '08:00' },
                closeTime: { type: 'string', example: '22:00' },
              },
            },
          },
        },
      },
      response: { 200: ok({ type: 'array', items: businessHourShape }, 'Jam operasional berhasil diperbarui') },
    },
  }, outletController.updateBusinessHours)

  app.patch('/me/business-hours/:day', {
    preHandler: canUpdate,
    schema: {
      tags: T, summary: 'Update jam operasional satu hari',
      description: 'Update jam operasional untuk satu hari saja. `:day` adalah angka 0 (Minggu) s.d. 6 (Sabtu).',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { day: { type: 'string', example: '1', description: '0=Minggu, 1=Senin, ..., 6=Sabtu' } },
      },
      body: {
        type: 'object',
        properties: {
          isOpen:    { type: 'boolean' },
          openTime:  { type: 'string', example: '09:00' },
          closeTime: { type: 'string', example: '21:00' },
        },
      },
      response: { 200: ok(businessHourShape, 'Jam operasional berhasil diperbarui') },
    },
  }, outletController.updateSingleBusinessHour)
}
