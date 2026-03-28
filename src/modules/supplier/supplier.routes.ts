import type { FastifyInstance } from 'fastify'
import { supplierController } from './supplier.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const can = (action: string) => [authenticate, authorize(RESOURCES.SUPPLIER, action as never)]

// ─── Reusable shape helpers ────────────────────────────────────────────────────

const obj = (props: object) => ({ type: 'object', additionalProperties: true, properties: props })

const supplierShape = obj({
  id: { type: 'string' }, name: { type: 'string' },
  contactName: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true },
  email: { type: 'string', nullable: true }, isActive: { type: 'boolean' },
  outletId: { type: 'string' },
  _count: obj({ purchaseOrders: { type: 'number' } }),
})

const poShape = obj({
  id: { type: 'string' }, orderNumber: { type: 'string' },
  status: { type: 'string', enum: ['DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED'] },
  totalAmount: { type: 'number' }, notes: { type: 'string', nullable: true },
  orderedAt: { type: 'string', nullable: true }, expectedAt: { type: 'string', nullable: true },
  receivedAt: { type: 'string', nullable: true },
  supplier: obj({ id: { type: 'string' }, name: { type: 'string' } }),
})

const ok = (data: object, msg = 'Berhasil') => ({
  type: 'object',
  properties: { success: { type: 'boolean' }, message: { type: 'string', example: msg }, data },
})

const err = (desc: string) => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean', example: false },
    error: obj({ code: { type: 'string' }, message: { type: 'string' } }),
  },
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function supplierRoutes(app: FastifyInstance) {
  const T = ['Supplier']
  const TPO = ['Purchase Order']

  // ── Supplier CRUD ────────────────────────────────────────────────────────

  app.get('/', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: T, summary: 'Daftar supplier',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:     { type: 'string', example: '1' },
          limit:    { type: 'string', example: '20' },
          search:   { type: 'string', description: 'Cari nama, kontak, phone, email' },
          isActive: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, supplierController.list)

  app.get('/:id', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: T, summary: 'Detail supplier',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 200: ok(supplierShape), 404: err('Supplier tidak ditemukan') },
    },
  }, supplierController.getById)

  app.post('/', {
    preHandler: can(ACTIONS.CREATE),
    schema: {
      tags: T, summary: 'Tambah supplier baru',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['name'],
        properties: {
          name:        { type: 'string', example: 'CV Sumber Bahan Utama' },
          contactName: { type: 'string', example: 'Pak Budi' },
          phone:       { type: 'string', example: '021-12345678' },
          email:       { type: 'string', format: 'email' },
          address:     { type: 'string' },
          notes:       { type: 'string' },
          isActive:    { type: 'boolean', default: true },
        },
      },
      response: { 201: ok(supplierShape, 'Supplier berhasil ditambahkan'), 422: err('Validasi gagal') },
    },
  }, supplierController.create)

  app.patch('/:id', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: T, summary: 'Update supplier',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 200: ok(supplierShape), 404: err('Supplier tidak ditemukan') },
    },
  }, supplierController.update)

  app.delete('/:id', {
    preHandler: can(ACTIONS.DELETE),
    schema: {
      tags: T, summary: 'Hapus supplier (soft delete)',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, supplierController.delete)

  // ── Purchase Orders ──────────────────────────────────────────────────────

  app.get('/purchase-orders', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: TPO, summary: 'Daftar Purchase Order',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:       { type: 'string' },
          limit:      { type: 'string' },
          supplierId: { type: 'string' },
          status:     { type: 'string', enum: ['DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED'] },
          startDate:  { type: 'string', example: '2024-01-01' },
          endDate:    { type: 'string', example: '2024-12-31' },
        },
      },
    },
  }, supplierController.listPo)

  app.get('/purchase-orders/:id', {
    preHandler: can(ACTIONS.READ),
    schema: {
      tags: TPO, summary: 'Detail Purchase Order (beserta semua item)',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 200: ok(poShape), 404: err('PO tidak ditemukan') },
    },
  }, supplierController.getPoById)

  app.post('/purchase-orders', {
    preHandler: can(ACTIONS.CREATE),
    schema: {
      tags: TPO, summary: 'Buat Purchase Order baru',
      description: 'PO dibuat dengan status DRAFT. Nomor PO di-generate otomatis: `PO-YYYYMMDD-XXXX`.\n\nUntuk mengubah status ke ORDERED, gunakan endpoint PATCH.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['supplierId', 'items'],
        properties: {
          supplierId: { type: 'string' },
          notes:      { type: 'string' },
          expectedAt: { type: 'string', example: '2024-10-20', description: 'Estimasi tanggal terima' },
          items: {
            type: 'array', minItems: 1,
            items: {
              type: 'object', required: ['productId', 'quantity', 'costPerUnit'],
              properties: {
                productId:   { type: 'string' },
                quantity:    { type: 'number', example: 100 },
                unit:        { type: 'string', example: 'pcs', default: 'pcs' },
                costPerUnit: { type: 'number', example: 12000 },
              },
            },
          },
        },
      },
      response: { 201: ok(poShape, 'Purchase Order berhasil dibuat'), 404: err('Supplier/Produk tidak ditemukan'), 422: err('Validasi gagal') },
    },
  }, supplierController.createPo)

  app.patch('/purchase-orders/:id', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: TPO, summary: 'Update Purchase Order',
      description: 'Update notes, expectedAt, atau ubah status.\n\n**Transisi status yang valid:**\n- DRAFT → ORDERED\n- ORDERED → CANCELLED\n- PARTIAL → CANCELLED\n\nStatus RECEIVED dan CANCELLED tidak bisa diubah.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          notes:      { type: 'string' },
          expectedAt: { type: 'string', example: '2024-10-25' },
          status:     { type: 'string', enum: ['DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED'] },
        },
      },
      response: { 200: ok(poShape), 400: err('Status tidak bisa diubah'), 404: err('PO tidak ditemukan') },
    },
  }, supplierController.updatePo)

  app.post('/purchase-orders/:id/cancel', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: TPO, summary: 'Batalkan Purchase Order',
      description: 'PO yang sudah RECEIVED tidak bisa dibatalkan.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 200: ok(poShape, 'PO berhasil dibatalkan'), 400: err('PO tidak bisa dibatalkan') },
    },
  }, supplierController.cancelPo)

  app.delete('/purchase-orders/:id', {
    preHandler: can(ACTIONS.DELETE),
    schema: {
      tags: TPO, summary: 'Hapus Purchase Order',
      description: 'Hanya PO berstatus **DRAFT** yang bisa dihapus permanen.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 200: ok({ type: 'null' }), 400: err('Hanya DRAFT yang bisa dihapus') },
    },
  }, supplierController.deletePo)

  app.post('/purchase-orders/:id/receive', {
    preHandler: can(ACTIONS.UPDATE),
    schema: {
      tags: TPO, summary: 'Catat penerimaan barang',
      description: 'Catat jumlah barang yang diterima per item. Status PO diperbarui otomatis:\n- Semua item terpenuhi → **RECEIVED**\n- Sebagian → **PARTIAL**\n\nKirim ulang endpoint ini untuk update penerimaan tambahan.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object', required: ['items'],
        properties: {
          notes: { type: 'string' },
          items: {
            type: 'array', minItems: 1,
            items: {
              type: 'object', required: ['purchaseOrderItemId', 'receivedQuantity'],
              properties: {
                purchaseOrderItemId: { type: 'string' },
                receivedQuantity:    { type: 'number', example: 50 },
              },
            },
          },
        },
      },
      response: {
        200: ok(poShape, 'Penerimaan barang berhasil dicatat'),
        400: err('PO sudah RECEIVED/CANCELLED, atau jumlah melebihi pesanan'),
        404: err('PO tidak ditemukan'),
      },
    },
  }, supplierController.receivePo)
}
