import type { FastifyInstance } from 'fastify'
import { receiptController } from './receipt.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { receiptResponseSchema } from './receipt.schema'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const tag = ['Receipt']

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
      },
    },
  },
})

// ─── Routes — mounted under /api/v1/orders/:orderId/receipt ──────────────────

export async function receiptRoutes(app: FastifyInstance) {
  const authRead = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.CREATE)]

  // POST /orders/:orderId/receipt
  app.post(
    '/',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Enqueue generate PDF receipt',
        description: [
          'Masukkan job generate PDF ke dalam queue. **Idempotent** — aman dipanggil berkali-kali.',
          '',
          '**Flow async:**',
          '```',
          'POST /receipt  →  status: QUEUED',
          '   ↓ worker picks up',
          '              →  status: GENERATING',
          '   ↓ PDF selesai',
          '              →  status: READY, pdfUrl: "/uploads/receipts/..."',
          '```',
          '',
          'Poll `GET /receipt` untuk cek apakah PDF sudah siap.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orderId'],
          properties: { orderId: { type: 'string', description: 'Order ID' } },
        },
        response: {
          202: successResponse(receiptResponseSchema, 'Receipt di-queue'),
          404: errorResponse('Order tidak ditemukan'),
        },
      },
    },
    receiptController.enqueue,
  )

  // GET /orders/:orderId/receipt
  app.get(
    '/',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Status & URL PDF receipt',
        description: [
          'Cek status generate receipt.',
          '',
          '| Status | Arti |',
          '|---|---|',
          '| `QUEUED` | Job sudah masuk antrian, belum diproses |',
          '| `GENERATING` | Worker sedang membuat PDF |',
          '| `READY` | PDF selesai, gunakan `pdfUrl` untuk download |',
          '| `FAILED` | Generate gagal, lihat `errorMessage`, bisa di-regenerate |',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orderId'],
          properties: { orderId: { type: 'string' } },
        },
        response: {
          200: successResponse(receiptResponseSchema, 'Status receipt'),
          404: errorResponse('Order atau receipt tidak ditemukan'),
        },
      },
    },
    receiptController.getStatus,
  )

  // POST /orders/:orderId/receipt/regenerate
  app.post(
    '/regenerate',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Regenerate receipt (reset & generate ulang)',
        description: [
          'Reset receipt ke QUEUED dan masukkan job baru ke queue.',
          '',
          '**Kapan dipakai:**',
          '- Receipt `FAILED` karena error sementara',
          '- Receipt `READY` tapi ingin format terbaru',
          '',
          '**Guard:** Tidak bisa regenerate jika masih `GENERATING`.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orderId'],
          properties: { orderId: { type: 'string' } },
        },
        response: {
          202: successResponse(receiptResponseSchema, 'Receipt akan di-generate ulang'),
          400: errorResponse('Receipt masih dalam proses GENERATING'),
          404: errorResponse('Order tidak ditemukan'),
        },
      },
    },
    receiptController.regenerate,
  )
}
