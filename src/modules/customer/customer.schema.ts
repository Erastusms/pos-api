import { z } from 'zod'

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  gender: z.string().max(20).optional(),
  birthDate: z.string().optional(),
  notes: z.string().max(500).optional(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

export const updateCustomerSchema = createCustomerSchema.partial()

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>

export const listCustomerQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
})
