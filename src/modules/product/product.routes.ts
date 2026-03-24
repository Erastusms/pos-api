import type { FastifyInstance } from 'fastify'
import { productController } from './product.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const can = (action: string) => [authenticate, authorize(RESOURCES.PRODUCT, action as never)]

// ─── Reusable response schemas ────────────────────────────────────────────────

const productShape = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    sku: { type: 'string' },
    price: { type: 'number' },
    cost: { type: 'number' },
    type: { type: 'string', enum: ['SINGLE', 'VARIANT'] },
    isActive: { type: 'boolean' },
    categoryId: { type: 'string', nullable: true },
    outletId: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
}

const variantShape = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    sku: { type: 'string' },
    price: { type: 'number', nullable: true },
    cost: { type: 'number', nullable: true },
    isActive: { type: 'boolean' },
  },
}

const modifierGroupShape = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    isRequired: { type: 'boolean' },
    minSelect: { type: 'number' },
    maxSelect: { type: 'number' },
    modifiers: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
}

const imageShape = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    altText: { type: 'string', nullable: true },
    isPrimary: { type: 'boolean' },
  },
}

const ok = (data: object, msg = 'Berhasil') => ({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string', example: msg },
    data,
  },
})

const err = (desc: string) => ({
  type: 'object',
  description: desc,
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      additionalProperties: true,
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function productRoutes(app: FastifyInstance) {
  const T = ['Product']

  // ── Product CRUD ─────────────────────────────────────────────────────────

  app.get(
    '/',
    {
      preHandler: can(ACTIONS.READ),
      schema: {
        tags: T,
        summary: 'Daftar produk',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string', example: '1' },
            limit: { type: 'string', example: '20' },
            search: { type: 'string', description: 'Cari nama, SKU, atau barcode' },
            categoryId: { type: 'string' },
            type: { type: 'string', enum: ['SINGLE', 'VARIANT'] },
            isActive: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    productController.list,
  )

  app.get(
    '/:id',
    {
      preHandler: can(ACTIONS.READ),
      schema: {
        tags: T,
        summary: 'Detail produk (beserta variant, modifier, gambar)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: ok(productShape), 404: err('Produk tidak ditemukan') },
      },
    },
    productController.getById,
  )

  app.post(
    '/',
    {
      preHandler: can(ACTIONS.CREATE),
      schema: {
        tags: T,
        summary: 'Tambah produk baru',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'sku'],
          properties: {
            name: { type: 'string', example: 'Es Kopi Susu' },
            description: { type: 'string' },
            sku: { type: 'string', example: 'KOP-001' },
            barcode: { type: 'string' },
            price: { type: 'number', example: 25000 },
            cost: { type: 'number', example: 12000 },
            type: { type: 'string', enum: ['SINGLE', 'VARIANT'], default: 'SINGLE' },
            categoryId: { type: 'string' },
            isActive: { type: 'boolean', default: true },
          },
        },
        response: {
          201: ok(productShape, 'Produk berhasil ditambahkan'),
          409: err('SKU sudah ada'),
          422: err('Validasi gagal'),
        },
      },
    },
    productController.create,
  )

  app.patch(
    '/:id',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Update produk',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 200: ok(productShape), 404: err('Produk tidak ditemukan') },
      },
    },
    productController.update,
  )

  app.delete(
    '/:id',
    {
      preHandler: can(ACTIONS.DELETE),
      schema: {
        tags: T,
        summary: 'Hapus produk (soft delete)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    productController.delete,
  )

  // ── Variants ────────────────────────────────────────────────────────────

  app.post(
    '/:id/variants',
    {
      preHandler: can(ACTIONS.CREATE),
      schema: {
        tags: T,
        summary: 'Tambah variant ke produk',
        description:
          'Produk harus bertipe VARIANT. Variant memiliki SKU sendiri dan bisa override harga/cost dari produk induk.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['name', 'sku'],
          properties: {
            name: { type: 'string', example: 'Size L - Hitam' },
            sku: { type: 'string', example: 'KOP-001-L-HIT' },
            barcode: { type: 'string' },
            price: { type: 'number', description: 'null = pakai harga produk induk' },
            cost: { type: 'number', description: 'null = pakai HPP produk induk' },
            attributes: {
              type: 'object',
              additionalProperties: { type: 'string' },
              example: { ukuran: 'L', warna: 'Hitam' },
            },
            isActive: { type: 'boolean', default: true },
            sortOrder: { type: 'integer', default: 0 },
          },
        },
        response: {
          201: ok(variantShape, 'Variant berhasil ditambahkan'),
          400: err('Tipe produk bukan VARIANT'),
          409: err('SKU sudah ada'),
        },
      },
    },
    productController.createVariant,
  )

  app.patch(
    '/:id/variants/:variantId',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Update variant',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, variantId: { type: 'string' } },
        },
      },
    },
    productController.updateVariant,
  )

  app.delete(
    '/:id/variants/:variantId',
    {
      preHandler: can(ACTIONS.DELETE),
      schema: {
        tags: T,
        summary: 'Hapus variant',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, variantId: { type: 'string' } },
        },
      },
    },
    productController.deleteVariant,
  )

  // ── Modifier Groups ──────────────────────────────────────────────────────

  app.post(
    '/:id/modifier-groups',
    {
      preHandler: can(ACTIONS.CREATE),
      schema: {
        tags: T,
        summary: 'Tambah modifier group ke produk',
        description: 'Contoh: "Level Gula" (wajib, pilih 1), "Topping Tambahan" (opsional, maks 3)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Level Gula' },
            description: { type: 'string' },
            isRequired: { type: 'boolean', default: false },
            minSelect: { type: 'integer', default: 0, example: 1 },
            maxSelect: { type: 'integer', default: 1, example: 1 },
            isActive: { type: 'boolean', default: true },
            sortOrder: { type: 'integer', default: 0 },
          },
        },
        response: { 201: ok(modifierGroupShape, 'Modifier group berhasil ditambahkan') },
      },
    },
    productController.createModifierGroup,
  )

  app.patch(
    '/:id/modifier-groups/:groupId',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Update modifier group',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, groupId: { type: 'string' } },
        },
      },
    },
    productController.updateModifierGroup,
  )

  app.delete(
    '/:id/modifier-groups/:groupId',
    {
      preHandler: can(ACTIONS.DELETE),
      schema: {
        tags: T,
        summary: 'Hapus modifier group (beserta semua modifiernya)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, groupId: { type: 'string' } },
        },
      },
    },
    productController.deleteModifierGroup,
  )

  // ── Modifiers ────────────────────────────────────────────────────────────

  app.post(
    '/:id/modifier-groups/:groupId/modifiers',
    {
      preHandler: can(ACTIONS.CREATE),
      schema: {
        tags: T,
        summary: 'Tambah modifier ke group',
        description: 'Contoh: modifier "25%", "Normal", "Extra" untuk group "Level Gula"',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, groupId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Normal' },
            price: {
              type: 'number',
              default: 0,
              example: 0,
              description: '0 = gratis, >0 = harga tambahan',
            },
            isActive: { type: 'boolean', default: true },
            sortOrder: { type: 'integer', default: 0 },
          },
        },
      },
    },
    productController.createModifier,
  )

  app.patch(
    '/:id/modifier-groups/:groupId/modifiers/:modifierId',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Update modifier',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupId: { type: 'string' },
            modifierId: { type: 'string' },
          },
        },
      },
    },
    productController.updateModifier,
  )

  app.delete(
    '/:id/modifier-groups/:groupId/modifiers/:modifierId',
    {
      preHandler: can(ACTIONS.DELETE),
      schema: {
        tags: T,
        summary: 'Hapus modifier',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupId: { type: 'string' },
            modifierId: { type: 'string' },
          },
        },
      },
    },
    productController.deleteModifier,
  )

  // ── Images ────────────────────────────────────────────────────────────────

  app.post(
    '/:id/images',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Upload foto produk',
        description:
          'Gunakan multipart/form-data. Field: `file` (wajib), `altText` (opsional), `variantId` (opsional), `isPrimary` (opsional, "true"/"false").\n\nFormat yang didukung: JPEG, PNG, WebP. Maks 5MB. Maks 10 foto per produk.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        consumes: ['multipart/form-data'],
        response: { 201: ok(imageShape, 'Foto berhasil diupload'), 400: err('File tidak valid') },
      },
    },
    productController.uploadImage,
  )

  app.patch(
    '/:id/images/:imageId/primary',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Set foto sebagai foto utama',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, imageId: { type: 'string' } },
        },
      },
    },
    productController.setPrimaryImage,
  )

  app.delete(
    '/:id/images/:imageId',
    {
      preHandler: can(ACTIONS.UPDATE),
      schema: {
        tags: T,
        summary: 'Hapus foto produk',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, imageId: { type: 'string' } },
        },
      },
    },
    productController.deleteImage,
  )
}
