import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'Nama kategori wajib diisi' })
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter')
    .trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Slug hanya boleh huruf kecil, angka, dan strip')
    .optional(),
  description: z.string().max(500).optional(),
  imageUrl:    z.string().url('Format URL tidak valid').optional(),
  parentId:    z.string().cuid('Format parent ID tidak valid').optional(),
  sortOrder:   z.number().int().min(0).optional().default(0),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = z.object({
  name:        z.string().min(2).max(100).trim().optional(),
  slug:        z.string().min(2).max(120).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  imageUrl:    z.string().url().optional(),
  parentId:    z.string().cuid().nullable().optional(),
  isActive:    z.boolean().optional(),
  sortOrder:   z.number().int().min(0).optional(),
})

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

export const listCategoryQuerySchema = z.object({
  tree: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  parentId: z.string().optional(),
})

export type ListCategoryQuery = z.infer<typeof listCategoryQuerySchema>

export const categoryResponseSchema = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    name:        { type: 'string' },
    slug:        { type: 'string' },
    description: { type: 'string', nullable: true },
    imageUrl:    { type: 'string', nullable: true },
    parentId:    { type: 'string', nullable: true },
    outletId:    { type: 'string', nullable: true },
    isActive:    { type: 'boolean' },
    sortOrder:   { type: 'number' },
    createdAt:   { type: 'string', format: 'date-time' },
    updatedAt:   { type: 'string', format: 'date-time' },
    children:    { type: 'array', items: { type: 'object', additionalProperties: true } },
    _count:      { type: 'object', additionalProperties: true },
  },
}
