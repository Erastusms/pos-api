import type { FastifyInstance } from 'fastify'
import { cartController } from './cart.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { cartResponseSchema, cartSummarySchema, appliedDiscountSchema } from './cart.schema'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const tag = ['Cart']

// ─── Response shape helpers (konsisten dengan modul lain) ─────────────────────

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
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  },
})

// Schema ringkas untuk daftar active carts (tanpa items penuh)
const cartListItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    outletId: { type: 'string' },
    userId: { type: 'string' },
    discountId: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    status: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    itemCount: { type: 'number' },
    total: { type: 'number' },
  },
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function cartRoutes(app: FastifyInstance) {
  const authRead = [authenticate, authorize(RESOURCES.CART, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.CART, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.CART, ACTIONS.UPDATE)]
  const authDelete = [authenticate, authorize(RESOURCES.CART, ACTIONS.DELETE)]

  // ── POST /carts ────────────────────────────────────────────────────────────
  app.post(
    '/',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Buat cart baru',
        description:
          'Membuat open bill baru. Satu kasir dapat memiliki beberapa cart ACTIVE secara bersamaan.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { notes: { type: 'string', maxLength: 500 } },
        },
        response: {
          201: successResponse(cartResponseSchema, 'Cart berhasil dibuat'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    cartController.create,
  )

  // ── GET /carts/active ──────────────────────────────────────────────────────
  app.get(
    '/active',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Daftar cart ACTIVE milik user',
        security: [{ bearerAuth: [] }],
        response: {
          200: successResponse({ type: 'array', items: cartListItemSchema }, 'Daftar cart aktif'),
        },
      },
    },
    cartController.listActive,
  )

  // ── GET /carts/:id ─────────────────────────────────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Detail cart',
        description:
          'Mengembalikan cart lengkap + items + kalkulasi total (subtotal → discount → service charge → tax → rounding → total).',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(cartResponseSchema, 'Detail cart'),
          404: errorResponse('Cart tidak ditemukan'),
        },
      },
    },
    cartController.getById,
  )

  // ── PATCH /carts/:id ───────────────────────────────────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Update catatan cart',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: { notes: { type: 'string', nullable: true, maxLength: 500 } },
        },
        response: {
          200: successResponse(cartResponseSchema, 'Cart diperbarui'),
          400: errorResponse('Cart sudah tidak ACTIVE'),
          404: errorResponse('Cart tidak ditemukan'),
        },
      },
    },
    cartController.update,
  )

  // ── DELETE /carts/:id ─────────────────────────────────────────────────────
  app.delete(
    '/:id',
    {
      preHandler: authDelete,
      schema: {
        tags: tag,
        summary: 'Batalkan cart (abandon)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(cartResponseSchema, 'Cart dibatalkan'),
          400: errorResponse('Cart sudah tidak ACTIVE'),
          404: errorResponse('Cart tidak ditemukan'),
        },
      },
    },
    cartController.abandon,
  )

  // ── POST /carts/:id/items ─────────────────────────────────────────────────
  app.post(
    '/:id/items',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Tambah item ke cart',
        description:
          'Harga di-snapshot saat item ditambahkan — tidak terpengaruh perubahan harga produk.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: { type: 'string' },
            variantId: { type: 'string' },
            quantity: { type: 'number', exclusiveMinimum: 0 },
            notes: { type: 'string', maxLength: 500 },
            modifiers: {
              type: 'array',
              items: {
                type: 'object',
                required: ['modifierId'],
                properties: { modifierId: { type: 'string' } },
              },
            },
          },
        },
        response: {
          201: successResponse(cartResponseSchema, 'Item ditambahkan'),
          400: errorResponse('Cart tidak ACTIVE / produk bukan tipe VARIANT'),
          404: errorResponse('Cart / Produk / Variant / Modifier tidak ditemukan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    cartController.addItem,
  )

  // ── PUT /carts/:id/items/:itemId ──────────────────────────────────────────
  app.put(
    '/:id/items/:itemId',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Update quantity / catatan satu item',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'itemId'],
          properties: { id: { type: 'string' }, itemId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            quantity: { type: 'number', exclusiveMinimum: 0 },
            notes: { type: 'string', nullable: true, maxLength: 500 },
          },
        },
        response: {
          200: successResponse(cartResponseSchema, 'Item diperbarui'),
          400: errorResponse('Cart sudah tidak ACTIVE'),
          404: errorResponse('Cart atau item tidak ditemukan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    cartController.updateItem,
  )

  // ── DELETE /carts/:id/items/:itemId ───────────────────────────────────────
  app.delete(
    '/:id/items/:itemId',
    {
      preHandler: authDelete,
      schema: {
        tags: tag,
        summary: 'Hapus satu item dari cart',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'itemId'],
          properties: { id: { type: 'string' }, itemId: { type: 'string' } },
        },
        response: {
          200: successResponse(cartResponseSchema, 'Item dihapus'),
          400: errorResponse('Cart sudah tidak ACTIVE'),
          404: errorResponse('Cart atau item tidak ditemukan'),
        },
      },
    },
    cartController.removeItem,
  )

  // ── DELETE /carts/:id/items ───────────────────────────────────────────────
  app.delete(
    '/:id/items',
    {
      preHandler: authDelete,
      schema: {
        tags: tag,
        summary: 'Kosongkan semua item (clear cart)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(cartResponseSchema, 'Semua item dihapus'),
          400: errorResponse('Cart sudah tidak ACTIVE'),
          404: errorResponse('Cart tidak ditemukan'),
        },
      },
    },
    cartController.clearItems,
  )

  // ── POST /carts/:id/discount ──────────────────────────────────────────────
  app.post(
    '/:id/discount',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Terapkan diskon ke cart',
        description: [
          'Gunakan `discountId` (CUID) **atau** `code` (kode promo), salah satu wajib.',
          'Validasi: diskon harus aktif, belum expired, dan milik outlet yang sama.',
          'Diskon yang sudah diterapkan harus dilepas dulu sebelum mengganti.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            discountId: { type: 'string', description: 'CUID diskon' },
            code: { type: 'string', description: 'Kode promo' },
          },
        },
        response: {
          200: successResponse(cartResponseSchema, 'Diskon diterapkan'),
          400: errorResponse('Cart tidak ACTIVE / diskon tidak valid / sudah diterapkan'),
          404: errorResponse('Cart atau diskon tidak ditemukan'),
          422: errorResponse('Validasi gagal — discountId atau code wajib diisi'),
        },
      },
    },
    cartController.applyDiscount,
  )

  // ── DELETE /carts/:id/discount ────────────────────────────────────────────
  app.delete(
    '/:id/discount',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Lepas diskon dari cart',
        description:
          'Melepas diskon yang sedang diterapkan. Summary akan dihitung ulang tanpa diskon.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(cartResponseSchema, 'Diskon dilepas'),
          400: errorResponse('Cart tidak ACTIVE / tidak ada diskon yang diterapkan'),
          404: errorResponse('Cart tidak ditemukan'),
        },
      },
    },
    cartController.removeDiscount,
  )
}
