import { z } from 'zod'

const productTypeEnum = z.enum(['SINGLE', 'VARIANT'])

// ─── Product ──────────────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string({ required_error: 'Nama produk wajib diisi' }).min(2).max(200).trim(),
  description: z.string().max(1000).optional(),
  sku: z.string({ required_error: 'SKU wajib diisi' }).min(1).max(100).trim().toUpperCase(),
  barcode: z.string().max(100).optional(),
  price: z.number().min(0).default(0),
  cost: z.number().min(0).default(0),
  type: productTypeEnum.default('SINGLE'),
  categoryId: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
})
export type CreateProductInput = z.infer<typeof createProductSchema>
export const updateProductSchema = createProductSchema.partial()
export type UpdateProductInput = z.infer<typeof updateProductSchema>

export const listProductSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  type: productTypeEnum.optional(),
  isActive: z.enum(['true', 'false']).optional(),
})
export type ListProductQuery = z.infer<typeof listProductSchema>

// ─── ProductVariant ───────────────────────────────────────────────────────────

export const createVariantSchema = z.object({
  name: z.string({ required_error: 'Nama variant wajib diisi' }).min(1).max(200).trim(),
  sku: z.string().min(1).max(100).trim().toUpperCase(),
  barcode: z.string().max(100).optional(),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  attributes: z.record(z.string()).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})
export type CreateVariantInput = z.infer<typeof createVariantSchema>
export const updateVariantSchema = createVariantSchema.partial()
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>

// ─── ProductModifierGroup — base + refine separated ──────────────────────────

const modifierGroupBase = z.object({
  name: z.string({ required_error: 'Nama group modifier wajib diisi' }).min(1).max(100).trim(),
  description: z.string().max(300).optional(),
  isRequired: z.boolean().default(false),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})

export const createModifierGroupSchema = modifierGroupBase.refine(
  (d) => d.minSelect <= d.maxSelect,
  { message: 'minSelect tidak boleh lebih besar dari maxSelect', path: ['minSelect'] },
)
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>

export const updateModifierGroupSchema = modifierGroupBase.partial().refine(
  (d) => {
    if (d.minSelect !== undefined && d.maxSelect !== undefined) return d.minSelect <= d.maxSelect
    return true
  },
  { message: 'minSelect tidak boleh lebih besar dari maxSelect', path: ['minSelect'] },
)
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>

// ─── ProductModifier ──────────────────────────────────────────────────────────

export const createModifierSchema = z.object({
  name: z.string({ required_error: 'Nama modifier wajib diisi' }).min(1).max(100).trim(),
  price: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})
export type CreateModifierInput = z.infer<typeof createModifierSchema>
export const updateModifierSchema = createModifierSchema.partial()
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>
