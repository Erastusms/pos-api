import type { FastifyInstance } from 'fastify'
import { orderController } from './order.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { orderResponseSchema } from './order.schema'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const tag = ['Order']

// ─── Response helpers (konsisten dengan modul lain) ───────────────────────────

const successResponse = (dataSchema: object, desc = 'Berhasil') => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data:    dataSchema,
  },
})

const paginatedResponse = (desc = 'Berhasil') => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean' },
    data:    { type: 'array', items: orderResponseSchema },
    meta: {
      type: 'object',
      properties: {
        page:        { type: 'number' },
        limit:       { type: 'number' },
        total:       { type: 'number' },
        totalPages:  { type: 'number' },
        hasNextPage: { type: 'boolean' },
        hasPrevPage: { type: 'boolean' },
      },
    },
  },
})

const errorResponse = (desc: string) => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code:    { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  },
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function orderRoutes(app: FastifyInstance) {
  const authRead   = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.CREATE)]
  const authVoid   = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.VOID)]

  // GET /orders
  app.get('/', {
    preHandler: authRead,
    schema: {
      tags: tag, summary: 'Daftar order',
      description: [
        'List order di outlet dengan filter status, tanggal, kasir, dan search by nomor order.',
        'Diurutkan dari yang terbaru.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:      { type: 'string' },
          limit:     { type: 'string' },
          status:    { type: 'string', enum: ['PENDING', 'PAID', 'DONE', 'VOID'] },
          userId:    { type: 'string', description: 'Filter by kasir (user ID)' },
          startDate: { type: 'string', format: 'date-time' },
          endDate:   { type: 'string', format: 'date-time' },
          search:    { type: 'string', description: 'Search by nomor order (TRX-...)' },
        },
      },
      response: { 200: paginatedResponse('Daftar order') },
    },
  }, orderController.list)

  // GET /orders/:id
  app.get('/:id', {
    preHandler: authRead,
    schema: {
      tags: tag, summary: 'Detail order',
      description: 'Mengembalikan order lengkap beserta semua item, modifier, dan snapshot finansial.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: {
        200: successResponse(orderResponseSchema, 'Detail order'),
        404: errorResponse('Order tidak ditemukan'),
      },
    },
  }, orderController.getById)

  // POST /orders
  app.post('/', {
    preHandler: authCreate,
    schema: {
      tags: tag, summary: 'Checkout cart → buat order',
      description: [
        'Mengonversi cart ACTIVE menjadi Order dengan status PENDING.',
        '',
        '**Flow:**',
        '1. Validasi cart (ACTIVE, tidak kosong, milik outlet)',
        '2. Hitung ulang total (discount + tax + rounding)',
        '3. Atomic transaction: lock cart → snapshot → buat order → deduct inventory FIFO',
        '',
        '**Race condition protection:** menggunakan `updateMany({ where: { status: "ACTIVE" } })`',
        'di dalam transaction — jika ada request lain yang sudah checkout cart yang sama,',
        'request ini akan mendapat error `CART_CHECKOUT_CONFLICT`.',
        '',
        '**Idempotency:** jika order untuk cartId ini sudah ada (non-VOID), mengembalikan 409.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['cartId'],
        properties: {
          cartId: { type: 'string', description: 'CUID cart yang akan di-checkout' },
          notes:  { type: 'string', maxLength: 500 },
        },
      },
      response: {
        201: successResponse(orderResponseSchema, 'Order berhasil dibuat'),
        400: errorResponse('Cart kosong / stok tidak mencukupi'),
        404: errorResponse('Cart tidak ditemukan'),
        409: errorResponse('Order sudah ada / cart checkout conflict'),
        422: errorResponse('Validasi gagal'),
      },
    },
  }, orderController.create)

  // POST /orders/:id/void
  app.post('/:id/void', {
    preHandler: authVoid,
    schema: {
      tags: tag, summary: 'Void order',
      description: [
        'Membatalkan order dan mengembalikan stok inventory.',
        '',
        '**Aturan void:**',
        '- `PENDING` → VOID: semua role dengan permission `transaction:void`',
        '- `PAID` → VOID: hanya **Manager / Owner / Super Admin** (roleId ≤ 3)',
        '- `DONE` atau `VOID`: tidak dapat di-void',
        '',
        '**Race condition protection:** re-check status di dalam transaction.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 3, maxLength: 500 },
        },
      },
      response: {
        200: successResponse(orderResponseSchema, 'Order berhasil di-void'),
        400: errorResponse('Status tidak valid / role tidak cukup / order sudah DONE'),
        404: errorResponse('Order tidak ditemukan'),
        409: errorResponse('Void conflict — diproses oleh request lain'),
        422: errorResponse('Validasi gagal'),
      },
    },
  }, orderController.void)

  // POST /orders/:id/complete
  app.post('/:id/complete', {
    preHandler: authVoid, // reuse void permission (manager level)
    schema: {
      tags: tag, summary: 'Selesaikan order (PAID → DONE)',
      description: 'Menandai order PAID sebagai selesai/diserahkan. Hanya order berstatus PAID yang bisa diselesaikan.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: {
        200: successResponse(orderResponseSchema, 'Order diselesaikan'),
        400: errorResponse('Status bukan PAID'),
        404: errorResponse('Order tidak ditemukan'),
      },
    },
  }, orderController.complete)
}
