import { z } from 'zod'

export const setInitialStockSchema = z.object({
  productId:   z.string({ required_error: 'Product ID wajib diisi' }).min(1),
  quantity:    z.number({ required_error: 'Jumlah stok wajib diisi' }).positive().max(999_999),
  costPerUnit: z.number({ required_error: 'Harga pokok per unit wajib diisi' }).min(0).max(999_999_999),
  unit:        z.string().min(1).max(20).optional().default('pcs'),
  notes:       z.string().max(500).optional(),
  reference:   z.string().max(100).optional(),
})

export type SetInitialStockInput = z.infer<typeof setInitialStockSchema>

const STOCK_IN_TYPES  = ['PURCHASE_IN', 'ADJUSTMENT_IN', 'RETURN_IN'] as const
const STOCK_OUT_TYPES = ['ADJUSTMENT_OUT'] as const
const ALL_MANUAL_TYPES = [...STOCK_IN_TYPES, ...STOCK_OUT_TYPES] as const

export const adjustStockSchema = z
  .object({
    inventoryItemId: z.string({ required_error: 'Inventory item ID wajib diisi' }).min(1),
    type: z.enum(ALL_MANUAL_TYPES, {
      errorMap: () => ({ message: `Tipe harus salah satu dari: ${ALL_MANUAL_TYPES.join(', ')}` }),
    }),
    quantity:    z.number({ required_error: 'Jumlah wajib diisi' }).positive(),
    costPerUnit: z.number().min(0).optional(),
    notes:       z.string().max(500).optional(),
    reference:   z.string().max(100).optional(),
  })
  .refine(
    (data) => {
      if ((STOCK_IN_TYPES as readonly string[]).includes(data.type)) {
        return data.costPerUnit !== undefined && data.costPerUnit >= 0
      }
      return true
    },
    { message: 'Harga pokok per unit wajib diisi untuk penambahan stok', path: ['costPerUnit'] },
  )

export type AdjustStockInput = z.infer<typeof adjustStockSchema>

export const listInventoryQuerySchema = z.object({
  page:  z.string().optional().transform((v) => parseInt(v ?? '1',  10) || 1),
  limit: z.string().optional().transform((v) => parseInt(v ?? '20', 10) || 20),
  search:       z.string().optional(),
  categoryId:   z.string().optional(),
  lowStockOnly: z.enum(['true', 'false']).optional().default('false').transform((v) => v === 'true'),
})

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>

export const historyQuerySchema = z.object({
  page:  z.string().optional().transform((v) => parseInt(v ?? '1',  10) || 1),
  limit: z.string().optional().transform((v) => parseInt(v ?? '20', 10) || 20),
  type:  z.string().optional(),
})

export type HistoryQuery = z.infer<typeof historyQuerySchema>

export const cogsPreviewSchema = z.object({
  quantity: z.number({ required_error: 'Jumlah wajib diisi' }).positive(),
})

export type CogsPreviewInput = z.infer<typeof cogsPreviewSchema>

export const inventoryItemResponseSchema = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    productId: { type: 'string' },
    outletId:  { type: 'string' },
    quantity:  { type: 'number' },
    unit:      { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    product: {
      type: 'object',
      properties: {
        id:       { type: 'string' },
        name:     { type: 'string' },
        sku:      { type: 'string' },
        category: { type: 'object', nullable: true, additionalProperties: true },
      },
    },
  },
}
