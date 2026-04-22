import type { FastifyInstance } from 'fastify'
import { inventoryController } from './inventory.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { inventoryItemResponseSchema } from './inventory.schema'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const tag = ['Inventory']

const successResponse = (dataSchema: object, desc = 'Berhasil') => ({
  type: 'object',
  description: desc,
  properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: dataSchema },
})

const paginatedResponse = (itemSchema: object) => ({
  type: 'object',
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

export async function inventoryRoutes(app: FastifyInstance) {
  const authRead = [authenticate, authorize(RESOURCES.INVENTORY, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.INVENTORY, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.INVENTORY, ACTIONS.UPDATE)]

  // GET /inventory
  app.get(
    '/',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Daftar inventory',
        description: 'Semua item inventory outlet yang sedang login.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            search: { type: 'string', description: 'Cari nama atau SKU' },
            categoryId: { type: 'string' },
            lowStockOnly: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: { 200: paginatedResponse(inventoryItemResponseSchema) },
      },
    },
    inventoryController.list,
  )

  // GET /inventory/item/:id
  app.get(
    '/item/:id',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Detail inventory item by ID',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: {
          200: successResponse(inventoryItemResponseSchema),
          404: errorResponse('Inventory tidak ditemukan'),
        },
      },
    },
    inventoryController.getById,
  )

  // GET /inventory/product/:productId
  app.get(
    '/product/:productId',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Inventory berdasarkan product ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['productId'],
          properties: { productId: { type: 'string' } },
        },
        response: {
          200: successResponse(inventoryItemResponseSchema),
          404: errorResponse('Inventory tidak ditemukan'),
        },
      },
    },
    inventoryController.getByProductId,
  )

  // POST /inventory/initial
  app.post(
    '/initial',
    {
      preHandler: authCreate,
      schema: {
        tags: tag,
        summary: 'Set stok awal produk',
        description:
          'Hanya bisa dilakukan sekali per produk. Membuat InventoryItem + cost layer FIFO pertama.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['productId', 'quantity', 'costPerUnit'],
          properties: {
            productId: { type: 'string' },
            quantity: { type: 'number', minimum: 0.001 },
            costPerUnit: { type: 'number', minimum: 0, description: 'Harga pokok per unit (Rp)' },
            unit: {
              type: 'string',
              default: 'pcs',
              description: 'Satuan: pcs, kg, liter, box, dll',
            },
            notes: { type: 'string' },
            reference: { type: 'string' },
          },
        },
        response: {
          201: successResponse(inventoryItemResponseSchema, 'Stok awal berhasil diset'),
          404: errorResponse('Produk tidak ditemukan'),
          409: errorResponse('Stok awal sudah pernah diset'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    inventoryController.setInitialStock,
  )

  // POST /inventory/adjust
  app.post(
    '/adjust',
    {
      preHandler: authUpdate,
      schema: {
        tags: tag,
        summary: 'Penyesuaian stok',
        description: [
          '**Tipe stock IN** (wajib costPerUnit): `PURCHASE_IN`, `ADJUSTMENT_IN`, `RETURN_IN`',
          '**Tipe stock OUT** (FIFO otomatis): `ADJUSTMENT_OUT`',
          '',
          'Gunakan `POST /inventory/item/:id/cogs-preview` untuk estimasi HPP sebelum adjustment.',
        ].join('\n'),
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['inventoryItemId', 'type', 'quantity'],
          properties: {
            inventoryItemId: { type: 'string' },
            type: {
              type: 'string',
              enum: ['PURCHASE_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'ADJUSTMENT_OUT'],
            },
            quantity: { type: 'number', minimum: 0.001 },
            costPerUnit: { type: 'number', minimum: 0, description: 'Wajib untuk stock IN' },
            notes: { type: 'string' },
            reference: { type: 'string' },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                inventoryItemId: { type: 'string' },
                type: { type: 'string' },
                quantity: { type: 'number' },
                quantityBefore: { type: 'number' },
                quantityAfter: { type: 'number' },
                totalCost: { type: 'number', nullable: true },
                avgCostPerUnit: { type: 'number', nullable: true },
                adjustmentId: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            'Stok berhasil disesuaikan',
          ),
          400: errorResponse('Stok tidak mencukupi'),
          404: errorResponse('Inventory tidak ditemukan'),
          422: errorResponse('Validasi gagal'),
        },
      },
    },
    inventoryController.adjustStock,
  )

  // GET /inventory/item/:id/history
  app.get(
    '/item/:id/history',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Riwayat pergerakan stok',
        description: 'Semua adjustment log untuk satu inventory item, urut dari terbaru.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            type: {
              type: 'string',
              enum: [
                'INITIAL',
                'PURCHASE_IN',
                'ADJUSTMENT_IN',
                'ADJUSTMENT_OUT',
                'SALE_OUT',
                'RETURN_IN',
                'VOID',
              ],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              item: inventoryItemResponseSchema,
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
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
          },
          404: errorResponse('Inventory tidak ditemukan'),
        },
      },
    },
    inventoryController.getHistory,
  )

  // POST /inventory/item/:id/cogs-preview
  app.post(
    '/item/:id/cogs-preview',
    {
      preHandler: authRead,
      schema: {
        tags: tag,
        summary: 'Preview COGS FIFO (read-only)',
        description: 'Hitung estimasi HPP menggunakan FIFO tanpa mengubah data apapun.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['quantity'],
          properties: { quantity: { type: 'number', minimum: 0.001 } },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                inventoryItemId: { type: 'string' },
                productName: { type: 'string' },
                currentStock: { type: 'number' },
                requestedQty: { type: 'number' },
                canFulfill: { type: 'boolean' },
                available: { type: 'number' },
                totalCost: { type: 'number' },
                avgCostPerUnit: { type: 'number' },
              },
            },
            'Estimasi COGS FIFO',
          ),
          404: errorResponse('Inventory tidak ditemukan'),
        },
      },
    },
    inventoryController.previewCogs,
  )
}
