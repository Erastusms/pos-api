import { productRepository } from './product.repository'
import { storageService } from '../../infrastructure/storage/storage.service'
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductQuery,
  CreateVariantInput,
  UpdateVariantInput,
  CreateModifierGroupInput,
  UpdateModifierGroupInput,
  CreateModifierInput,
  UpdateModifierInput,
} from './product.schema'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors'
import type { UploadedFile } from '../../infrastructure/storage/storage.service'

// ─── Service ──────────────────────────────────────────────────────────────────

export const productService = {
  // ── Product CRUD ───────────────────────────────────────────────────────────

  async list(outletId: string, query: ListProductQuery) {
    return productRepository.findMany(outletId, query)
  },

  async getById(id: string) {
    const product = await productRepository.findById(id)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')
    return product
  },

  async create(input: CreateProductInput, outletId: string) {
    // SKU harus unik dalam satu outlet
    const existing = await productRepository.findBySku(input.sku, outletId)
    if (existing) {
      throw new ConflictError(
        `SKU "${input.sku}" sudah digunakan di outlet ini`,
        'PRODUCT_SKU_EXISTS',
      )
    }

    return productRepository.create({ ...input, outletId })
  },

  async update(id: string, input: UpdateProductInput, outletId: string) {
    const product = await productRepository.findById(id)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')

    // Jika SKU berubah, pastikan tidak konflik
    if (input.sku && input.sku !== product.sku) {
      const conflict = await productRepository.findBySku(input.sku, outletId)
      if (conflict && conflict.id !== id) {
        throw new ConflictError(`SKU "${input.sku}" sudah digunakan`, 'PRODUCT_SKU_EXISTS')
      }
    }

    return productRepository.update(id, input)
  },

  async delete(id: string) {
    const product = await productRepository.findById(id)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')
    return productRepository.softDelete(id)
  },

  // ── Variant ────────────────────────────────────────────────────────────────

  async createVariant(productId: string, input: CreateVariantInput) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')

    if (product.type !== 'VARIANT') {
      throw new BadRequestError(
        'Variant hanya bisa ditambahkan ke produk bertipe VARIANT. Ubah tipe produk terlebih dahulu.',
        'PRODUCT_TYPE_MISMATCH',
      )
    }

    const existing = await productRepository.findVariantBySku(input.sku, productId)
    if (existing) {
      throw new ConflictError(
        `SKU variant "${input.sku}" sudah ada di produk ini`,
        'VARIANT_SKU_EXISTS',
      )
    }

    return productRepository.createVariant(productId, input)
  },

  async updateVariant(variantId: string, input: UpdateVariantInput) {
    const variant = await productRepository.findVariantById(variantId)
    if (!variant) throw new NotFoundError('Variant', 'VARIANT_NOT_FOUND')

    if (input.sku && input.sku !== variant.sku) {
      const conflict = await productRepository.findVariantBySku(input.sku, variant.productId)
      if (conflict && conflict.id !== variantId) {
        throw new ConflictError(`SKU "${input.sku}" sudah digunakan`, 'VARIANT_SKU_EXISTS')
      }
    }

    return productRepository.updateVariant(variantId, input)
  },

  async deleteVariant(variantId: string) {
    const variant = await productRepository.findVariantById(variantId)
    if (!variant) throw new NotFoundError('Variant', 'VARIANT_NOT_FOUND')
    return productRepository.deleteVariant(variantId)
  },

  // ── ModifierGroup ──────────────────────────────────────────────────────────

  async createModifierGroup(productId: string, input: CreateModifierGroupInput) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')
    return productRepository.createModifierGroup(productId, input)
  },

  async updateModifierGroup(groupId: string, input: UpdateModifierGroupInput) {
    const group = await productRepository.findModifierGroupById(groupId)
    if (!group) throw new NotFoundError('Modifier group', 'MODIFIER_GROUP_NOT_FOUND')
    return productRepository.updateModifierGroup(groupId, input)
  },

  async deleteModifierGroup(groupId: string) {
    const group = await productRepository.findModifierGroupById(groupId)
    if (!group) throw new NotFoundError('Modifier group', 'MODIFIER_GROUP_NOT_FOUND')
    return productRepository.deleteModifierGroup(groupId)
  },

  // ── Modifier ───────────────────────────────────────────────────────────────

  async createModifier(groupId: string, input: CreateModifierInput) {
    const group = await productRepository.findModifierGroupById(groupId)
    if (!group) throw new NotFoundError('Modifier group', 'MODIFIER_GROUP_NOT_FOUND')
    return productRepository.createModifier(groupId, input)
  },

  async updateModifier(modifierId: string, input: UpdateModifierInput) {
    const modifier = await productRepository.findModifierById(modifierId)
    if (!modifier) throw new NotFoundError('Modifier', 'MODIFIER_NOT_FOUND')
    return productRepository.updateModifier(modifierId, input)
  },

  async deleteModifier(modifierId: string) {
    const modifier = await productRepository.findModifierById(modifierId)
    if (!modifier) throw new NotFoundError('Modifier', 'MODIFIER_NOT_FOUND')
    return productRepository.deleteModifier(modifierId)
  },

  // ── Image upload ───────────────────────────────────────────────────────────

  async uploadImage(
    productId: string,
    file: UploadedFile,
    options: { variantId?: string; altText?: string; isPrimary?: boolean },
  ) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')

    // Maksimal 10 foto per produk
    const imageCount = await productRepository.countImages(productId)
    if (imageCount >= 10) {
      throw new BadRequestError('Produk sudah memiliki 10 foto (maksimal)', 'MAX_IMAGES_REACHED')
    }

    // Determine isPrimary: auto-set true jika belum ada gambar sama sekali
    const isPrimary = options.isPrimary ?? imageCount === 0

    const stored = await storageService.save(file)

    const image = await productRepository.createImage({
      productId,
      variantId: options.variantId,
      url: stored.url,
      altText: options.altText,
      isPrimary,
      sortOrder: imageCount, // append at end
    })

    // Jika isPrimary, demote semua gambar lain
    if (isPrimary) {
      await productRepository.setPrimaryImage(productId, image.id)
    }

    return image
  },

  async deleteImage(imageId: string) {
    const image = await productRepository.findImageById(imageId)
    if (!image) throw new NotFoundError('Gambar', 'IMAGE_NOT_FOUND')

    // Hapus file dari storage
    await storageService.delete(image.url)
    await productRepository.deleteImage(imageId)
  },

  async setPrimaryImage(productId: string, imageId: string) {
    const image = await productRepository.findImageById(imageId)
    if (!image) throw new NotFoundError('Gambar', 'IMAGE_NOT_FOUND')
    if (image.productId !== productId) {
      throw new BadRequestError('Gambar tidak milik produk ini', 'IMAGE_PRODUCT_MISMATCH')
    }
    await productRepository.setPrimaryImage(productId, imageId)
  },
}
