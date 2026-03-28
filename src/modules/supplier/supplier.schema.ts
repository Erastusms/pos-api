import { z } from 'zod'

// ─── Supplier ─────────────────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name:        z.string({ required_error: 'Nama supplier wajib diisi' }).min(2).max(200).trim(),
  contactName: z.string().max(100).trim().optional(),
  phone:       z.string().max(50).optional(),
  email:       z.string().email('Format email tidak valid').toLowerCase().trim().optional(),
  address:     z.string().max(500).optional(),
  notes:       z.string().max(500).optional(),
  isActive:    z.boolean().default(true),
})
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>

export const updateSupplierSchema = createSupplierSchema.partial()
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>

export const listSupplierSchema = z.object({
  page:     z.string().optional(),
  limit:    z.string().optional(),
  search:   z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
})
export type ListSupplierQuery = z.infer<typeof listSupplierSchema>

// ─── Purchase Order ───────────────────────────────────────────────────────────

const poStatusEnum = z.enum(['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'])

const poItemSchema = z.object({
  productId:   z.string({ required_error: 'Product ID wajib diisi' }).min(1),
  quantity:    z.number({ required_error: 'Jumlah wajib diisi' }).positive('Jumlah harus lebih dari 0'),
  unit:        z.string().max(20).default('pcs'),
  costPerUnit: z.number({ required_error: 'Harga satuan wajib diisi' }).min(0),
})
export type PoItemInput = z.infer<typeof poItemSchema>

export const createPurchaseOrderSchema = z.object({
  supplierId:  z.string({ required_error: 'Supplier wajib dipilih' }).min(1),
  notes:       z.string().max(500).optional(),
  expectedAt:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD').optional(),
  items: z
    .array(poItemSchema, { required_error: 'Minimal 1 item harus ditambahkan' })
    .min(1, 'Minimal 1 item harus ditambahkan'),
})
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>

export const updatePurchaseOrderSchema = z.object({
  notes:      z.string().max(500).optional(),
  expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:     poStatusEnum.optional(),
})
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>

export const listPurchaseOrderSchema = z.object({
  page:       z.string().optional(),
  limit:      z.string().optional(),
  supplierId: z.string().optional(),
  status:     poStatusEnum.optional(),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type ListPurchaseOrderQuery = z.infer<typeof listPurchaseOrderSchema>

// ─── Receive items ────────────────────────────────────────────────────────────

const receiveItemSchema = z.object({
  purchaseOrderItemId: z.string().min(1),
  receivedQuantity:    z.number().positive('Jumlah diterima harus lebih dari 0'),
})

export const receivePurchaseOrderSchema = z.object({
  items: z.array(receiveItemSchema).min(1, 'Minimal 1 item harus diterima'),
  notes: z.string().max(500).optional(),
})
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>
