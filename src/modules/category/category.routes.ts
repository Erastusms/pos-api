import type { FastifyInstance } from 'fastify'
import { categoryController } from './category.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { categoryResponseSchema } from './category.schema'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const tag = ['Category']

const successResponse = (dataSchema: object, desc = 'Berhasil') => ({
  type: 'object', description: desc,
  properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: dataSchema },
})

const errorResponse = (desc: string) => ({
  type: 'object', description: desc,
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code:    { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  },
})

export async function categoryRoutes(app: FastifyInstance) {
  const authRead   = [authenticate, authorize(RESOURCES.CATEGORY, ACTIONS.READ)]
  const authCreate = [authenticate, authorize(RESOURCES.CATEGORY, ACTIONS.CREATE)]
  const authUpdate = [authenticate, authorize(RESOURCES.CATEGORY, ACTIONS.UPDATE)]
  const authDelete = [authenticate, authorize(RESOURCES.CATEGORY, ACTIONS.DELETE)]

  // GET /categories
  app.get('/', {
    preHandler: authRead,
    schema: {
      tags: tag, summary: 'Daftar semua kategori',
      description: '`tree=true` → nested tree | `tree=false` → flat list | `parentId=` → root only',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          tree:            { type: 'string', enum: ['true', 'false'] },
          includeInactive: { type: 'string', enum: ['true', 'false'] },
          parentId:        { type: 'string' },
        },
      },
      response: { 200: successResponse({ type: 'array', items: categoryResponseSchema }) },
    },
  }, categoryController.list)

  // GET /categories/:id
  app.get('/:id', {
    preHandler: authRead,
    schema: {
      tags: tag, summary: 'Detail kategori',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: {
        200: successResponse(categoryResponseSchema),
        404: errorResponse('Kategori tidak ditemukan'),
      },
    },
  }, categoryController.getById)

  // POST /categories
  app.post('/', {
    preHandler: authCreate,
    schema: {
      tags: tag, summary: 'Buat kategori baru',
      description: 'Slug auto-generate dari name. Mendukung nested maksimal 2 level.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['name'],
        properties: {
          name:        { type: 'string', minLength: 2 },
          slug:        { type: 'string' },
          description: { type: 'string' },
          imageUrl:    { type: 'string', format: 'uri' },
          parentId:    { type: 'string' },
          sortOrder:   { type: 'number', default: 0 },
        },
      },
      response: {
        201: successResponse(categoryResponseSchema, 'Kategori berhasil dibuat'),
        409: errorResponse('Slug sudah digunakan'),
        422: errorResponse('Validasi gagal'),
      },
    },
  }, categoryController.create)

  // PUT /categories/:id
  app.put('/:id', {
    preHandler: authUpdate,
    schema: {
      tags: tag, summary: 'Update kategori',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name:        { type: 'string' },
          slug:        { type: 'string' },
          description: { type: 'string' },
          imageUrl:    { type: 'string' },
          parentId:    { type: 'string', nullable: true },
          isActive:    { type: 'boolean' },
          sortOrder:   { type: 'number' },
        },
      },
      response: {
        200: successResponse(categoryResponseSchema, 'Kategori diperbarui'),
        404: errorResponse('Kategori tidak ditemukan'),
        409: errorResponse('Slug sudah digunakan'),
      },
    },
  }, categoryController.update)

  // DELETE /categories/:id
  app.delete('/:id', {
    preHandler: authDelete,
    schema: {
      tags: tag, summary: 'Hapus kategori (soft delete)',
      description: 'Gagal jika masih ada sub-kategori atau produk aktif.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: {
        200: successResponse({ type: 'null' }, 'Kategori dihapus'),
        400: errorResponse('Masih ada sub-kategori atau produk'),
        404: errorResponse('Kategori tidak ditemukan'),
      },
    },
  }, categoryController.delete)
}
