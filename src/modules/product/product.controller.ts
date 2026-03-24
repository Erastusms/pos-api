import type { FastifyRequest, FastifyReply } from 'fastify'
import type { z } from 'zod'
import { productService } from './product.service'
import {
  createProductSchema,
  updateProductSchema,
  listProductSchema,
  createVariantSchema,
  updateVariantSchema,
  createModifierGroupSchema,
  updateModifierGroupSchema,
  createModifierSchema,
  updateModifierSchema,
} from './product.schema'
import { sendSuccess, sendPaginated } from '../../shared/utils/response'
import { ValidationError, BadRequestError } from '../../shared/errors'

function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(
      'Validasi input gagal',
      result.error.errors.map((e) => ({
        field: e.path.join('.') || 'body',
        message: e.message,
      })),
    )
  }
  return result.data
}

type Req = FastifyRequest
type Rep = FastifyReply

export const productController = {
  async list(request: Req, reply: Rep) {
    const query = validate(listProductSchema, request.query)
    if (!request.user.outletId) {
      throw new BadRequestError('Outlet ID is required', 'MISSING_OUTLET_ID')
    }
    const result = await productService.list(request.user.outletId, query)
    return sendPaginated(reply, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  },

  async getById(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const product = await productService.getById(id)
    return sendSuccess(reply, product)
  },

  async create(request: Req, reply: Rep) {
    const input = validate(createProductSchema, request.body)
    if (!request.user.outletId) {
      throw new BadRequestError('Outlet ID is required', 'MISSING_OUTLET_ID')
    }
    const product = await productService.create(input, request.user.outletId)
    return sendSuccess(reply, product, 'Produk berhasil ditambahkan', 201)
  },

  async update(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(updateProductSchema, request.body)
    if (!request.user.outletId) {
      throw new BadRequestError('Outlet ID is required', 'MISSING_OUTLET_ID')
    }
    const product = await productService.update(id, input, request.user.outletId)
    return sendSuccess(reply, product, 'Produk berhasil diperbarui')
  },

  async delete(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    await productService.delete(id)
    return sendSuccess(reply, null, 'Produk berhasil dihapus')
  },

  async createVariant(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(createVariantSchema, request.body)
    const variant = await productService.createVariant(id, input)
    return sendSuccess(reply, variant, 'Variant berhasil ditambahkan', 201)
  },

  async updateVariant(request: Req, reply: Rep) {
    const { variantId } = request.params as { id: string; variantId: string }
    const input = validate(updateVariantSchema, request.body)
    const variant = await productService.updateVariant(variantId, input)
    return sendSuccess(reply, variant, 'Variant berhasil diperbarui')
  },

  async deleteVariant(request: Req, reply: Rep) {
    const { variantId } = request.params as { id: string; variantId: string }
    await productService.deleteVariant(variantId)
    return sendSuccess(reply, null, 'Variant berhasil dihapus')
  },

  async createModifierGroup(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const input = validate(createModifierGroupSchema, request.body)
    const group = await productService.createModifierGroup(id, input)
    return sendSuccess(reply, group, 'Modifier group berhasil ditambahkan', 201)
  },

  async updateModifierGroup(request: Req, reply: Rep) {
    const { groupId } = request.params as { id: string; groupId: string }
    const input = validate(updateModifierGroupSchema, request.body)
    const group = await productService.updateModifierGroup(groupId, input)
    return sendSuccess(reply, group, 'Modifier group berhasil diperbarui')
  },

  async deleteModifierGroup(request: Req, reply: Rep) {
    const { groupId } = request.params as { id: string; groupId: string }
    await productService.deleteModifierGroup(groupId)
    return sendSuccess(reply, null, 'Modifier group berhasil dihapus')
  },

  async createModifier(request: Req, reply: Rep) {
    const { groupId } = request.params as { id: string; groupId: string }
    const input = validate(createModifierSchema, request.body)
    const modifier = await productService.createModifier(groupId, input)
    return sendSuccess(reply, modifier, 'Modifier berhasil ditambahkan', 201)
  },

  async updateModifier(request: Req, reply: Rep) {
    const { modifierId } = request.params as { id: string; groupId: string; modifierId: string }
    const input = validate(updateModifierSchema, request.body)
    const modifier = await productService.updateModifier(modifierId, input)
    return sendSuccess(reply, modifier, 'Modifier berhasil diperbarui')
  },

  async deleteModifier(request: Req, reply: Rep) {
    const { modifierId } = request.params as { id: string; groupId: string; modifierId: string }
    await productService.deleteModifier(modifierId)
    return sendSuccess(reply, null, 'Modifier berhasil dihapus')
  },

  async uploadImage(request: Req, reply: Rep) {
    const { id } = request.params as { id: string }
    const data = await request.file()
    if (!data) throw new BadRequestError('File gambar wajib disertakan', 'MISSING_FILE')
    const buffer = await data.toBuffer()

    const parts = request.body as Record<string, { value?: string } | string> | undefined
    const getField = (key: string) =>
      parts
        ? typeof parts[key] === 'object'
          ? (parts[key] as { value?: string }).value
          : (parts[key] as string)
        : undefined

    const image = await productService.uploadImage(
      id,
      { fieldname: data.fieldname, filename: data.filename, mimetype: data.mimetype, data: buffer },
      {
        variantId: getField('variantId'),
        altText: getField('altText'),
        isPrimary: getField('isPrimary') === 'true',
      },
    )
    return sendSuccess(reply, image, 'Foto berhasil diupload', 201)
  },

  async deleteImage(request: Req, reply: Rep) {
    const { imageId } = request.params as { id: string; imageId: string }
    await productService.deleteImage(imageId)
    return sendSuccess(reply, null, 'Foto berhasil dihapus')
  },

  async setPrimaryImage(request: Req, reply: Rep) {
    const { id, imageId } = request.params as { id: string; imageId: string }
    await productService.setPrimaryImage(id, imageId)
    return sendSuccess(reply, null, 'Foto utama berhasil diubah')
  },
}
