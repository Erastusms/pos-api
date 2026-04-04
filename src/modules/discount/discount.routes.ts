import type { FastifyInstance } from 'fastify'
import { discountController } from './discount.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { discountResponseSchema } from './discount.schema'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const tag = ['Discount']

// ─── Response helpers (konsisten dengan modul lain) ───────────────────────────

const successResponse = (dataSchema: object, desc = 'Berhasil') => ({
  type: 'object',
  description: desc,
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: dataSchema,
  },
})

const paginatedResponse = (desc = 'Berhasil') => ({
  type: 'object',
  description: desc,
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: discountResponseSchema },
    meta: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        limit: { type: 'number' },
        total: { type: 'number' },
        totalPages: { type: 'number' },
        hasNextPage: { type: 'boolean' },
        hasPrevPage: { type: 'boolean' },
      },
    },
  },
})

const errorResponse = (desc: string) => ({
  type: 'object',
  description: desc,
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  },
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function discountRoutes(app: FastifyInstance) {
  const authRead = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.UPDATE)]
  const authDelete = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.DELETE)]

  // GET /discounts
  app.get(
    '/',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Daftar diskon',
        description:
          'List semua diskon di outlet. Filter by type, scope, isActive, atau search by nama/kode.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            search: { type: 'string' },
            type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
            scope: { type: 'string', enum: ['PER_ITEM', 'PER_BILL'] },
            isActive: { type: 'string', enum: ['true', 'false'] },
            includeExpired: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: { 200: paginatedResponse('Daftar diskon') },
      },
    },
    discountController.list,
  )

  // GET /discounts/:id
  app.get(
    '/:id',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Detail diskon',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(discountResponseSchema, 'Detail diskon'),
          404: errorResponse('Diskon tidak ditemukan'),
        },
      },
    },
    discountController.getById,
  )

  // POST /discounts
  app.post(
    '/',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Buat diskon baru',
        description: [
          '**Type:** `PERCENTAGE` (0-100%) atau `FIXED_AMOUNT` (nominal Rp).',
          '**Scope:** `PER_BILL` (seluruh bill) atau `PER_ITEM` (produk tertentu).',
          '- `PER_ITEM` wajib mengisi `productIds`.',
          '- `minPurchase`: diskon hanya berlaku jika subtotal ≥ nilai ini.',
          '- `maxDiscount`: cap jumlah diskon maksimal (terutama untuk PERCENTAGE).',
          '- `code`: kode promo unik per outlet (opsional).',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'type', 'scope', 'value'],
          properties: {
            name: { type: 'string', minLength: 2 },
            code: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
            scope: { type: 'string', enum: ['PER_ITEM', 'PER_BILL'] },
            value: { type: 'number', exclusiveMinimum: 0 },
            minPurchase: { type: 'number', minimum: 0 },
            maxDiscount: { type: 'number', minimum: 0 },
            isActive: { type: 'boolean' },
            startAt: { type: 'string', format: 'date-time' },
            endAt: { type: 'string', format: 'date-time' },
            productIds: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          201: successResponse(discountResponseSchema, 'Diskon berhasil dibuat'),
          409: errorResponse('Kode promo sudah digunakan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    discountController.create,
  )

  // PATCH /discounts/:id
  app.patch(
    '/:id',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Update diskon',
        description:
          'Update field diskon. Jika `productIds` dikirim, seluruh daftar produk akan di-replace.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
            scope: { type: 'string', enum: ['PER_ITEM', 'PER_BILL'] },
            value: { type: 'number', exclusiveMinimum: 0 },
            minPurchase: { type: 'number', nullable: true },
            maxDiscount: { type: 'number', nullable: true },
            isActive: { type: 'boolean' },
            startAt: { type: 'string', format: 'date-time', nullable: true },
            endAt: { type: 'string', format: 'date-time', nullable: true },
            productIds: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          200: successResponse(discountResponseSchema, 'Diskon diperbarui'),
          404: errorResponse('Diskon tidak ditemukan'),
          409: errorResponse('Kode promo sudah digunakan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    discountController.update,
  )

  // DELETE /discounts/:id
  app.delete(
    '/:id',
    {
      preHandler: authDelete,
      schema: {
        tags: tag,
        summary: 'Hapus diskon (soft delete)',
        description: 'Gagal jika masih ada cart aktif yang memakai diskon ini.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse({ type: 'null' }, 'Diskon dihapus'),
          400: errorResponse('Diskon masih digunakan oleh cart aktif'),
          404: errorResponse('Diskon tidak ditemukan'),
        },
      },
    },
    discountController.delete,
  )
}
