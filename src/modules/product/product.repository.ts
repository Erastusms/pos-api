import { prisma } from '../../infrastructure/database/prisma.client'
import { parsePagination } from '../../shared/utils/pagination'
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

// ─── Shared selects ───────────────────────────────────────────────────────────

const productListSelect = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  price: true,
  cost: true,
  type: true,
  isActive: true,
  categoryId: true,
  outletId: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: {
    where: { isPrimary: true },
    select: { id: true, url: true, altText: true },
    take: 1,
  },
  _count: { select: { variants: true, modifierGroups: true } },
} as const

const productDetailSelect = {
  ...productListSelect,
  images: {
    select: {
      id: true,
      url: true,
      altText: true,
      isPrimary: true,
      sortOrder: true,
      variantId: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      price: true,
      cost: true,
      attributes: true,
      isActive: true,
      sortOrder: true,
      images: { select: { id: true, url: true, altText: true, isPrimary: true }, take: 1 },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  modifierGroups: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      isRequired: true,
      minSelect: true,
      maxSelect: true,
      isActive: true,
      sortOrder: true,
      modifiers: {
        where: { isActive: true },
        select: { id: true, name: true, price: true, isActive: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const

// ─── Repository ───────────────────────────────────────────────────────────────

export const productRepository = {
  // ── Product ────────────────────────────────────────────────────────────────

  async findMany(outletId: string, query: ListProductQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const isActive =
      query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined

    const where = {
      outletId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { barcode: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        select: productListSelect,
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      prisma.product.count({ where }),
    ])

    return { data, total, page, limit }
  },

  findById(id: string) {
    return prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: productDetailSelect,
    })
  },

  findBySku(sku: string, outletId: string) {
    return prisma.product.findFirst({
      where: { sku, outletId, deletedAt: null },
    })
  },

  create(data: CreateProductInput & { outletId: string }) {
    return prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        sku: data.sku,
        barcode: data.barcode,
        price: data.price,
        cost: data.cost,
        type: data.type,
        isActive: data.isActive,
        outletId: data.outletId,
        ...(data.categoryId ? { category: { connect: { id: data.categoryId } } } : {}),
      },
      select: productDetailSelect,
    })
  },

  update(id: string, data: UpdateProductInput) {
    return prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(data.categoryId !== undefined
          ? data.categoryId
            ? { category: { connect: { id: data.categoryId } } }
            : { category: { disconnect: true } }
          : {}),
      },
      select: productDetailSelect,
    })
  },

  softDelete(id: string) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, name: true },
    })
  },

  // ── Variant ────────────────────────────────────────────────────────────────

  findVariantById(id: string) {
    return prisma.productVariant.findUnique({
      where: { id },
      include: { images: { select: { id: true, url: true, isPrimary: true } } },
    })
  },

  findVariantBySku(sku: string, productId: string) {
    return prisma.productVariant.findUnique({
      where: { sku_productId: { sku, productId } },
    })
  },

  createVariant(productId: string, data: CreateVariantInput) {
    return prisma.productVariant.create({
      data: { ...data, productId },
    })
  },

  updateVariant(id: string, data: UpdateVariantInput) {
    return prisma.productVariant.update({ where: { id }, data })
  },

  deleteVariant(id: string) {
    return prisma.productVariant.delete({ where: { id } })
  },

  // ── ModifierGroup ──────────────────────────────────────────────────────────

  findModifierGroupById(id: string) {
    return prisma.productModifierGroup.findUnique({
      where: { id },
      include: { modifiers: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    })
  },

  createModifierGroup(productId: string, data: CreateModifierGroupInput) {
    return prisma.productModifierGroup.create({
      data: { ...data, productId },
      include: { modifiers: true },
    })
  },

  updateModifierGroup(id: string, data: UpdateModifierGroupInput) {
    return prisma.productModifierGroup.update({
      where: { id },
      data,
      include: { modifiers: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    })
  },

  deleteModifierGroup(id: string) {
    return prisma.productModifierGroup.delete({ where: { id } })
  },

  // ── Modifier ───────────────────────────────────────────────────────────────

  findModifierById(id: string) {
    return prisma.productModifier.findUnique({ where: { id } })
  },

  createModifier(modifierGroupId: string, data: CreateModifierInput) {
    return prisma.productModifier.create({ data: { ...data, modifierGroupId } })
  },

  updateModifier(id: string, data: UpdateModifierInput) {
    return prisma.productModifier.update({ where: { id }, data })
  },

  deleteModifier(id: string) {
    return prisma.productModifier.delete({ where: { id } })
  },

  // ── Images ─────────────────────────────────────────────────────────────────

  findImageById(id: string) {
    return prisma.productImage.findUnique({ where: { id } })
  },

  createImage(data: {
    productId: string
    variantId?: string
    url: string
    altText?: string
    isPrimary: boolean
    sortOrder: number
  }) {
    return prisma.productImage.create({ data })
  },

  /**
   * If new image is primary, demote all other images of this product to non-primary.
   * Runs inside the same transaction for atomicity.
   */
  async setPrimaryImage(productId: string, imageId: string) {
    await prisma.$transaction([
      prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      }),
      prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ])
  },

  deleteImage(id: string) {
    return prisma.productImage.delete({ where: { id } })
  },

  countImages(productId: string) {
    return prisma.productImage.count({ where: { productId } })
  },
}
