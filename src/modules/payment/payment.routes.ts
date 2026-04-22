import type { FastifyInstance } from 'fastify'
import { paymentController } from './payment.controller'
import { authenticate }      from '../../shared/middlewares/authenticate'
import { authorize }         from '../../shared/middlewares/authorize'
import { paymentResponseSchema } from './payment.schema'
import { RESOURCES, ACTIONS }    from '../../shared/constants/permissions'

const tag = ['Payment']

// ─── Response helpers (konsisten dengan modul lain) ───────────────────────────

const successResponse = (dataSchema: object, desc = 'Berhasil') => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data:    dataSchema,
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

export async function paymentRoutes(app: FastifyInstance) {
  const authRead   = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.UPDATE)]

  // ── GET /payments/orders/:orderId ─────────────────────────────────────────
  app.get('/orders/:orderId', {
    preHandler: authRead,
    schema: {
      tags: tag,
      summary: 'Detail payment untuk satu order',
      description: 'Mengembalikan data payment beserta nomor VA dan status terkini.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['orderId'],
        properties: { orderId: { type: 'string', description: 'Order ID' } },
      },
      response: {
        200: successResponse(paymentResponseSchema, 'Detail payment'),
        404: errorResponse('Order atau payment tidak ditemukan'),
      },
    },
  }, paymentController.getByOrderId)

  // ── POST /payments ────────────────────────────────────────────────────────
  app.post('/', {
    preHandler: authCreate,
    schema: {
      tags: tag,
      summary: 'Buat Virtual Account Bank Transfer',
      description: [
        'Generate nomor Virtual Account (VA) untuk order PENDING.',
        '',
        '**Bank yang didukung:** `bca` | `bni` | `bri` | `permata` | `mandiri`',
        '',
        '**Idempotent:** Jika dipanggil ulang dengan bank yang sama saat payment masih PENDING,',
        'akan mengembalikan payment yang sudah ada (tidak membuat VA baru).',
        '',
        '**Flow setelah buat VA:**',
        '```',
        '1. Tampilkan vaNumber ke kasir/customer',
        '2. Customer transfer ke vaNumber',
        '3. Midtrans kirim webhook ke POST /payments/callback/midtrans',
        '4. Order otomatis berubah ke PAID',
        '```',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['orderId', 'bankName'],
        properties: {
          orderId:  { type: 'string', description: 'CUID order yang akan dibayar' },
          bankName: { type: 'string', enum: ['bca', 'bni', 'bri', 'permata', 'mandiri'] },
        },
      },
      response: {
        201: successResponse(paymentResponseSchema, 'VA berhasil dibuat'),
        400: errorResponse('Order bukan PENDING atau sudah lunas'),
        404: errorResponse('Order tidak ditemukan'),
        409: errorResponse('Order sudah lunas'),
        422: errorResponse('Validasi gagal'),
      },
    },
  }, paymentController.create)

  // ── PATCH /payments/orders/:orderId/method ────────────────────────────────
  app.patch('/orders/:orderId/method', {
    preHandler: authUpdate,
    schema: {
      tags: tag,
      summary: 'Ganti bank Virtual Account',
      description: [
        'Membatalkan VA lama di Midtrans dan membuat VA baru dengan bank berbeda.',
        '',
        '**Guard:**',
        '- Payment harus berstatus PENDING',
        '- Bank baru tidak boleh sama dengan bank saat ini',
        '',
        '**Contoh use case:** Customer awalnya pilih BCA, tapi ingin ganti ke BNI.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['orderId'],
        properties: { orderId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['bankName'],
        properties: {
          bankName: { type: 'string', enum: ['bca', 'bni', 'bri', 'permata', 'mandiri'] },
        },
      },
      response: {
        200: successResponse(paymentResponseSchema, 'Metode pembayaran diubah'),
        400: errorResponse('Payment tidak PENDING / bank sama / order bukan PENDING'),
        404: errorResponse('Order atau payment tidak ditemukan'),
        422: errorResponse('Validasi gagal'),
      },
    },
  }, paymentController.changeMethod)

  // ── POST /payments/orders/:orderId/sync ───────────────────────────────────
  app.post('/orders/:orderId/sync', {
    preHandler: authUpdate,
    schema: {
      tags: tag,
      summary: 'Sinkron status payment dari Midtrans',
      description: [
        'Poll status terbaru dari Midtrans dan update DB secara manual.',
        '',
        '**Kapan dipakai:** Jika webhook Midtrans tidak diterima (jaringan bermasalah,',
        'server down, dll).',
        '',
        'Jika status settlement, Order otomatis berubah ke PAID.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['orderId'],
        properties: { orderId: { type: 'string' } },
      },
      response: {
        200: successResponse(paymentResponseSchema, 'Status tersinkron'),
        404: errorResponse('Order atau payment tidak ditemukan'),
      },
    },
  }, paymentController.syncStatus)

  // ── POST /payments/callback/midtrans ──────────────────────────────────────
  // PENTING: Endpoint ini TIDAK pakai authenticate middleware
  // Keamanan dijamin oleh signature_key verification di dalam service
  app.post('/callback/midtrans', {
    schema: {
      tags: tag,
      summary: 'Webhook callback dari Midtrans',
      description: [
        '**UNTUK MIDTRANS — BUKAN UNTUK CLIENT**',
        '',
        'Endpoint ini dipanggil otomatis oleh Midtrans setiap kali status transaksi berubah.',
        'Tidak perlu Bearer Token — keamanan dijamin dengan verifikasi `signature_key`',
        '(SHA512 dari `order_id + status_code + gross_amount + server_key`).',
        '',
        'Daftarkan URL ini di Midtrans Dashboard:',
        '`Settings → Configuration → Payment Notification URL`',
        '',
        'URL: `https://yourserver.com/api/v1/payments/callback/midtrans`',
        '',
        '**Alur:**',
        '1. Verifikasi signature_key',
        '2. Temukan payment by `order_id`',
        '3. Update status payment',
        '4. Jika settlement → Order berubah ke PAID',
      ].join('\n'),
      body: {
        type:                 'object',
        additionalProperties: true,
        properties: {
          transaction_id:     { type: 'string' },
          order_id:           { type: 'string' },
          gross_amount:       { type: 'string' },
          payment_type:       { type: 'string' },
          transaction_status: { type: 'string' },
          fraud_status:       { type: 'string' },
          signature_key:      { type: 'string' },
          status_code:        { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success:   { type: 'boolean' },
            processed: { type: 'boolean' },
            message:   { type: 'string' },
          },
        },
        400: errorResponse('Signature tidak valid'),
      },
    },
  }, paymentController.handleMidtransCallback)
}
