import type { FastifyInstance } from 'fastify'
import { voucherController } from './voucher.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'
import {
  voucherResponseSchema,
  voucherValidationResultSchema,
  voucherRedemptionResponseSchema,
} from './voucher.schema'

const tag = ['Voucher']

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

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function voucherRoutes(app: FastifyInstance) {
  const authRead = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.UPDATE)]
  const authDelete = [authenticate, authorize(RESOURCES.DISCOUNT, ACTIONS.DELETE)]
  const authTx = [authenticate, authorize(RESOURCES.TRANSACTION, ACTIONS.CREATE)]

  // ── GET /vouchers ──────────────────────────────────────────────────────────
  app.get(
    '/',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Daftar voucher & promo',
        description: [
          'List semua voucher di outlet.',
          'Filter by `type`, `scope`, `isActive`, `autoApply`, atau search by nama/kode.',
          'Default tidak menampilkan voucher expired — gunakan `includeExpired=true` jika perlu.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            search: { type: 'string', description: 'Cari by nama atau kode' },
            type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
            scope: { type: 'string', enum: ['PER_BILL', 'PER_ITEM'] },
            isActive: { type: 'string', enum: ['true', 'false'] },
            autoApply: { type: 'string', enum: ['true', 'false'] },
            includeExpired: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
        },
        response: { 200: paginatedResponse(voucherResponseSchema, 'Daftar voucher') },
      },
    },
    voucherController.list,
  )

  // ── GET /vouchers/auto-apply ───────────────────────────────────────────────
  app.get(
    '/auto-apply',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Cari voucher auto-apply terbaik',
        description: [
          'Mengembalikan voucher `autoApply=true` yang memberikan diskon terbesar untuk subtotal tertentu.',
          'Strategi: **best-value** — bukan first-match.',
          '',
          'Digunakan oleh frontend untuk menampilkan banner "Hemat Rp X otomatis!" sebelum checkout.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['subtotal'],
          properties: {
            subtotal: { type: 'string', example: '80000', description: 'Nilai subtotal cart (Rp)' },
            customerId: {
              type: 'string',
              description: 'ID customer (opsional, untuk cek usage limit per customer)',
            },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                autoApply: { type: 'boolean' },
                voucher: { ...voucherResponseSchema, nullable: true },
                discountPreview: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    discountAmount: { type: 'number' },
                    discountedSubtotal: { type: 'number' },
                  },
                },
              },
            },
            'Hasil pencarian auto-apply',
          ),
        },
      },
    },
    voucherController.getAutoApply,
  )

  // ── GET /vouchers/:id ──────────────────────────────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Detail voucher',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(voucherResponseSchema, 'Detail voucher'),
          404: errorResponse('Voucher tidak ditemukan'),
        },
      },
    },
    voucherController.getById,
  )

  // ── POST /vouchers ─────────────────────────────────────────────────────────
  app.post(
    '/',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Buat voucher / promo baru',
        description: [
          '**Type:** `PERCENTAGE` (0–100%) atau `FIXED_AMOUNT` (nominal Rp).',
          '**Scope:** `PER_BILL` (seluruh bill) atau `PER_ITEM` (produk tertentu).',
          '',
          '**Auto-apply rules:**',
          '- `autoApply: true` → tidak butuh kode, diterapkan otomatis jika syarat terpenuhi',
          '- `autoApply: false` → `code` wajib diisi',
          '- `priority`: voucher auto-apply dengan priority lebih tinggi diproses lebih dulu',
          '',
          '**Usage limits:**',
          '- `usageLimit`: batas total penggunaan (null = tidak terbatas)',
          '- `usageLimitPerCustomer`: batas per customer (null = tidak terbatas)',
          '',
          '**Targeting customer:**',
          '- `customerId`: voucher eksklusif untuk satu customer tertentu',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'type', 'scope', 'value'],
          properties: {
            name: { type: 'string', minLength: 2, example: 'Promo Lebaran 20%' },
            code: {
              type: 'string',
              example: 'LEBARAN20',
              description: 'Wajib jika autoApply=false',
            },
            description: { type: 'string' },
            type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
            scope: { type: 'string', enum: ['PER_BILL', 'PER_ITEM'] },
            value: { type: 'number', exclusiveMinimum: 0, example: 20 },
            minPurchase: { type: 'number', minimum: 0 },
            maxDiscount: { type: 'number', minimum: 0 },
            usageLimit: {
              type: 'number',
              minimum: 1,
              description: 'Total maks penggunaan (null = tak terbatas)',
            },
            usageLimitPerCustomer: { type: 'number', minimum: 1 },
            autoApply: { type: 'boolean', default: false },
            priority: { type: 'number', minimum: 0, default: 0 },
            customerId: { type: 'string', description: 'Voucher eksklusif untuk customer ini' },
            isActive: { type: 'boolean', default: true },
            startAt: { type: 'string', format: 'date-time' },
            endAt: { type: 'string', format: 'date-time' },
            productIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Wajib jika scope=PER_ITEM',
            },
          },
        },
        response: {
          201: successResponse(voucherResponseSchema, 'Voucher berhasil dibuat'),
          409: errorResponse('Kode voucher sudah digunakan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    voucherController.create,
  )

  // ── PATCH /vouchers/:id ────────────────────────────────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Update voucher',
        description: 'Jika `productIds` dikirim, seluruh daftar produk di-replace.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
            scope: { type: 'string', enum: ['PER_BILL', 'PER_ITEM'] },
            value: { type: 'number', exclusiveMinimum: 0 },
            minPurchase: { type: 'number', nullable: true },
            maxDiscount: { type: 'number', nullable: true },
            usageLimit: { type: 'number', nullable: true },
            usageLimitPerCustomer: { type: 'number', nullable: true },
            autoApply: { type: 'boolean' },
            priority: { type: 'number', minimum: 0 },
            customerId: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            startAt: { type: 'string', format: 'date-time', nullable: true },
            endAt: { type: 'string', format: 'date-time', nullable: true },
            productIds: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          200: successResponse(voucherResponseSchema, 'Voucher diperbarui'),
          404: errorResponse('Voucher tidak ditemukan'),
          409: errorResponse('Kode sudah digunakan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    voucherController.update,
  )

  // ── DELETE /vouchers/:id ───────────────────────────────────────────────────
  app.delete(
    '/:id',
    {
      preHandler: authDelete,
      schema: {
        tags: tag,
        summary: 'Hapus voucher (soft delete)',
        description: 'Gagal jika masih ada cart aktif yang memakai voucher ini.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse({ type: 'null' }, 'Voucher dihapus'),
          400: errorResponse('Voucher masih digunakan cart aktif'),
          404: errorResponse('Voucher tidak ditemukan'),
        },
      },
    },
    voucherController.delete,
  )

  // ── POST /vouchers/validate ────────────────────────────────────────────────
  app.post(
    '/validate',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Validasi kode voucher (tanpa menggunakannya)',
        description: [
          'Cek apakah kode voucher valid dan hitung preview diskon.',
          'Tidak mengubah `usageCount` — aman dipanggil berkali-kali.',
          '',
          '**Gunakan untuk:**',
          '- Validasi real-time saat customer mengetik kode di checkout',
          '- Tampilkan preview diskon sebelum order dibuat',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', example: 'WELCOME10' },
            cartId: { type: 'string', description: 'Cart ID (opsional, untuk konteks)' },
            customerId: {
              type: 'string',
              description: 'Customer ID untuk cek usage limit per customer',
            },
            subtotal: { type: 'number', example: 75000, description: 'Subtotal cart saat ini' },
          },
        },
        response: {
          200: successResponse(voucherValidationResultSchema, 'Hasil validasi'),
        },
      },
    },
    voucherController.validate,
  )

  // ── POST /vouchers/carts/:cartId/apply ────────────────────────────────────
  app.post(
    '/carts/:cartId/apply',
    {
      preHandler: authTx,
      schema: {
        tags: tag,
        summary: 'Terapkan voucher ke cart',
        description: [
          'Gunakan `code` (kode promo) **atau** `voucherId`, salah satu wajib.',
          '',
          'Validasi yang dilakukan:',
          '- Voucher aktif dan belum expired',
          '- Voucher belum habis (usageLimit)',
          '- Usage per customer belum melebihi batas',
          '- Targeting customer sesuai (jika voucher punya customerId)',
          '',
          '**Note:** minPurchase hanya akan dicek ulang saat checkout, bukan di sini.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['cartId'],
          properties: { cartId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'WELCOME10' },
            voucherId: { type: 'string', description: 'CUID voucher' },
            customerId: {
              type: 'string',
              description: 'Customer ID (untuk cek usage per customer)',
            },
          },
        },
        response: {
          200: successResponse(voucherResponseSchema, 'Voucher diterapkan'),
          400: errorResponse('Voucher tidak valid / sudah habis / tidak berlaku untuk akun ini'),
          404: errorResponse('Voucher atau cart tidak ditemukan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    voucherController.applyToCart,
  )

  // ── DELETE /vouchers/carts/:cartId/apply ──────────────────────────────────
  app.delete(
    '/carts/:cartId/apply',
    {
      preHandler: authTx,
      schema: {
        tags: tag,
        summary: 'Lepas voucher dari cart',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['cartId'],
          properties: { cartId: { type: 'string' } },
        },
        response: {
          200: successResponse({ type: 'null' }, 'Voucher dilepas dari cart'),
          400: errorResponse('Cart tidak aktif / tidak ada voucher'),
        },
      },
    },
    voucherController.removeFromCart,
  )

  // ── GET /vouchers/:id/redemptions ──────────────────────────────────────────
  app.get(
    '/:id/redemptions',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Riwayat penggunaan voucher',
        description: 'Log semua order yang menggunakan voucher ini, diurutkan dari terbaru.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: paginatedResponse(voucherRedemptionResponseSchema, 'Riwayat penggunaan'),
          404: errorResponse('Voucher tidak ditemukan'),
        },
      },
    },
    voucherController.getRedemptions,
  )
}
