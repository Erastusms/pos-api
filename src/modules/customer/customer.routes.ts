import type { FastifyInstance } from 'fastify'
import { customerController } from './customer.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'
import {
  customerResponseSchema,
  loyaltyProgramResponseSchema,
  loyaltyTransactionResponseSchema,
  customerPointSummarySchema,
} from './customer.schema'

const tag = ['Customer']
const tagLoy = ['Loyalty']

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

const paginatedResponse = (itemSchema: object, desc = 'Berhasil') => ({
  type: 'object',
  description: desc,
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: itemSchema },
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

const orderHistoryItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    orderNumber: { type: 'string' },
    status: { type: 'string', enum: ['PENDING', 'PAID', 'DONE', 'VOID'] },
    total: { type: 'number' },
    subtotal: { type: 'number' },
    discountAmount: { type: 'number' },
    taxAmount: { type: 'number' },
    itemCount: { type: 'number' },
    paidAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function customerRoutes(app: FastifyInstance) {
  const authRead = [authenticate, authorize(RESOURCES.CUSTOMER, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.CUSTOMER, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.CUSTOMER, ACTIONS.UPDATE)]
  const authDelete = [authenticate, authorize(RESOURCES.CUSTOMER, ACTIONS.DELETE)]

  // ── GET /customers ───────────────────────────────────────────────────────
  app.get(
    '/',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Daftar customer',
        description:
          'List semua customer di outlet. Filter by isActive atau cari by nama, email, phone.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string', example: '1' },
            limit: { type: 'string', example: '20' },
            search: { type: 'string', description: 'Cari by nama, email, atau nomor telepon' },
            isActive: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: paginatedResponse(customerResponseSchema, 'Daftar customer'),
        },
      },
    },
    customerController.list,
  )

  // ── GET /customers/:id ───────────────────────────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Detail customer',
        description: 'Mengembalikan profil customer lengkap beserta saldo poin loyalitas.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: successResponse(customerResponseSchema, 'Detail customer'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.getById,
  )

  // ── POST /customers ──────────────────────────────────────────────────────
  app.post(
    '/',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Daftarkan customer baru',
        description: [
          'Nomor telepon dan email harus unik per outlet.',
          'Salah satu dari `phone` atau `email` sangat dianjurkan untuk identifikasi customer.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Andi Wijaya', minLength: 2 },
            email: { type: 'string', format: 'email', example: 'andi@email.com' },
            phone: { type: 'string', example: '081234567890' },
            birthDate: { type: 'string', example: '1990-03-15', description: 'Format YYYY-MM-DD' },
            address: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        response: {
          201: successResponse(customerResponseSchema, 'Customer berhasil didaftarkan'),
          409: errorResponse('Nomor telepon atau email sudah terdaftar'),
          422: errorResponse('Validasi input gagal'),
        },
      },
    },
    customerController.create,
  )

  // ── PATCH /customers/:id ─────────────────────────────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Update profil customer',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            birthDate: { type: 'string', example: '1990-03-15' },
            address: { type: 'string' },
            notes: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        },
        response: {
          200: successResponse(customerResponseSchema, 'Customer diperbarui'),
          404: errorResponse('Customer tidak ditemukan'),
          409: errorResponse('Nomor telepon atau email sudah digunakan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    customerController.update,
  )

  // ── DELETE /customers/:id ────────────────────────────────────────────────
  app.delete(
    '/:id',
    {
      preHandler: authDelete,
      schema: {
        tags: tag,
        summary: 'Hapus customer (soft delete)',
        description:
          'Customer yang dihapus tidak akan muncul di list, namun data historis tetap terjaga.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: successResponse({ type: 'null' }, 'Customer berhasil dihapus'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.delete,
  )

  // ── GET /customers/:id/orders ────────────────────────────────────────────
  app.get(
    '/:id/orders',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Riwayat transaksi customer',
        description: 'Semua order yang pernah dilakukan oleh customer ini, diurutkan dari terbaru.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'PAID', 'DONE', 'VOID'] },
          },
        },
        response: {
          200: paginatedResponse(orderHistoryItemSchema, 'Riwayat transaksi'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.getOrderHistory,
  )

  // ── GET /customers/:id/loyalty ────────────────────────────────────────────
  app.get(
    '/:id/loyalty',
    {
      preHandler: authRead,
      schema: {
        tags: tagLoy,
        summary: 'Ringkasan poin loyalitas customer',
        description: [
          'Mengembalikan saldo poin aktif beserta statistik:',
          '- Total poin yang pernah dikumpulkan',
          '- Total poin yang pernah digunakan (redeem)',
          '- Total poin yang expired',
          '- Nilai rupiah dari poin saat ini',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: successResponse(customerPointSummarySchema, 'Ringkasan poin'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.getPointSummary,
  )

  // ── GET /customers/:id/loyalty/transactions ───────────────────────────────
  app.get(
    '/:id/loyalty/transactions',
    {
      preHandler: authRead,
      schema: {
        tags: tagLoy,
        summary: 'Riwayat transaksi poin customer',
        description: [
          'Daftar semua pergerakan poin customer (earn, redeem, expire, adjust, refund).',
          'Diurutkan dari yang terbaru.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            type: { type: 'string', enum: ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REFUND'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: paginatedResponse(loyaltyTransactionResponseSchema, 'Riwayat poin'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.getLoyaltyTransactions,
  )

  // ── POST /customers/loyalty/earn ──────────────────────────────────────────
  app.post(
    '/loyalty/earn',
    {
      preHandler: authCreate,
      schema: {
        tags: tagLoy,
        summary: 'Tambah poin customer dari transaksi',
        description: [
          'Hitung dan tambahkan poin ke customer berdasarkan nilai transaksi.',
          '',
          '**Biasanya dipanggil otomatis oleh Payment module setelah settlement.**',
          'Endpoint ini tersedia untuk integrasi manual jika diperlukan.',
          '',
          'Validasi:',
          '- Program loyalitas harus aktif',
          '- Nilai transaksi harus ≥ minimumSpend',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['customerId', 'orderId', 'amount'],
          properties: {
            customerId: { type: 'string', description: 'CUID customer' },
            orderId: { type: 'string', description: 'CUID order' },
            amount: { type: 'number', description: 'Nilai total transaksi (Rp)', example: 78000 },
          },
        },
        response: {
          200: successResponse(loyaltyTransactionResponseSchema, 'Poin berhasil ditambahkan'),
          400: errorResponse('Program tidak aktif / belum memenuhi minimum spend'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.earnPoints,
  )

  // ── POST /customers/loyalty/redeem ────────────────────────────────────────
  app.post(
    '/loyalty/redeem',
    {
      preHandler: authCreate,
      schema: {
        tags: tagLoy,
        summary: 'Redeem poin customer',
        description: [
          'Tukarkan poin customer menjadi nilai rupiah untuk potongan harga.',
          '',
          '**Guard:**',
          '- Program loyalitas harus aktif',
          '- Poin ≥ minimumRedeemPoints',
          '- Saldo poin customer harus mencukupi',
          '',
          '**Return:** nilai rupiah yang diperoleh dari redeem.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['customerId', 'points'],
          properties: {
            customerId: { type: 'string' },
            points: {
              type: 'number',
              example: 100,
              description: 'Jumlah poin yang akan di-redeem',
            },
            orderId: { type: 'string', description: 'Order ID terkait (opsional)' },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                transaction: loyaltyTransactionResponseSchema,
                rupiahValue: {
                  type: 'number',
                  description: 'Nilai rupiah dari poin yang di-redeem',
                },
                newBalance: { type: 'number', description: 'Saldo poin setelah redeem' },
              },
            },
            'Redeem berhasil',
          ),
          400: errorResponse('Saldo poin tidak mencukupi / minimum tidak terpenuhi'),
          404: errorResponse('Customer tidak ditemukan'),
        },
      },
    },
    customerController.redeemPoints,
  )

  // ── POST /customers/loyalty/adjust ───────────────────────────────────────
  app.post(
    '/loyalty/adjust',
    {
      preHandler: [authenticate, authorize(RESOURCES.CUSTOMER, ACTIONS.UPDATE)],
      schema: {
        tags: tagLoy,
        summary: 'Penyesuaian poin manual',
        description: [
          'Tambah atau kurangi poin secara manual — biasanya oleh admin/manager.',
          '',
          '- `points` positif → tambah poin',
          '- `points` negatif → kurangi poin',
          '',
          '**Catatan:** Penyesuaian negatif tidak boleh membuat saldo di bawah 0.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['customerId', 'points'],
          properties: {
            customerId: { type: 'string' },
            points: {
              type: 'number',
              example: 100,
              description: 'Poin yang ditambah (+) atau dikurangi (-)',
            },
            description: { type: 'string', example: 'Bonus ulang tahun', maxLength: 500 },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                transaction: loyaltyTransactionResponseSchema,
                newBalance: { type: 'number' },
              },
            },
            'Penyesuaian poin berhasil',
          ),
          400: errorResponse('Saldo akan menjadi negatif'),
          404: errorResponse('Customer tidak ditemukan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    customerController.adjustPoints,
  )

  // ── GET /customers/loyalty/preview ───────────────────────────────────────
  app.get(
    '/loyalty/preview',
    {
      preHandler: authRead,
      schema: {
        tags: tagLoy,
        summary: 'Preview poin yang akan diperoleh dari transaksi',
        description:
          'Hitung estimasi poin yang akan didapat customer jika bertransaksi sejumlah `amount`. Tidak mengubah data.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: { type: 'string', example: '78000', description: 'Nilai transaksi dalam Rp' },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                eligible: { type: 'boolean' },
                points: { type: 'number' },
                reason: { type: 'string', nullable: true },
              },
            },
            'Preview poin',
          ),
        },
      },
    },
    customerController.previewEarnPoints,
  )

  // ── GET /customers/loyalty/program ───────────────────────────────────────
  app.get(
    '/loyalty/program',
    {
      preHandler: authRead,
      schema: {
        tags: tagLoy,
        summary: 'Konfigurasi program loyalitas outlet',
        security: [{ bearerAuth: [] }],
        response: {
          200: successResponse(loyaltyProgramResponseSchema, 'Konfigurasi program loyalitas'),
        },
      },
    },
    customerController.getLoyaltyProgram,
  )

  // ── PUT /customers/loyalty/program ───────────────────────────────────────
  app.put(
    '/loyalty/program',
    {
      preHandler: [authenticate, authorize(RESOURCES.OUTLET, ACTIONS.UPDATE)],
      schema: {
        tags: tagLoy,
        summary: 'Setup / update program loyalitas',
        description: [
          'Konfigurasi program poin untuk outlet. **Upsert** — aman dipanggil berkali-kali.',
          '',
          '**Contoh konfigurasi:**',
          '- `pointsPerRupiah: 1` + `minimumSpend: 10000`',
          '  → setiap Rp 10.000 transaksi dapat 10 poin (Rp 10.000 × 1)',
          '- `pointValue: 100`',
          '  → 1 poin = Rp 100 saat redeem',
          '- `minimumRedeemPoints: 50`',
          '  → minimal 50 poin untuk bisa redeem (= Rp 5.000)',
          '- `pointExpiryDays: 365`',
          '  → poin kadaluarsa setelah 1 tahun (0 = tidak expired)',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Poin Setia' },
            description: { type: 'string' },
            isActive: { type: 'boolean' },
            pointsPerRupiah: { type: 'number', example: 1, description: 'Poin per 1 rupiah' },
            minimumSpend: { type: 'number', example: 10000 },
            pointValue: { type: 'number', example: 100, description: 'Nilai 1 poin dalam Rp' },
            minimumRedeemPoints: { type: 'number', example: 50 },
            pointExpiryDays: { type: 'number', example: 365, description: '0 = tidak expired' },
          },
        },
        response: {
          200: successResponse(loyaltyProgramResponseSchema, 'Program loyalitas berhasil disimpan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    customerController.upsertLoyaltyProgram,
  )
}
