import { prisma } from '../../infrastructure/database/prisma.client'

const categorySelect = {
  id:          true,
  name:        true,
  slug:        true,
  description: true,
  imageUrl:    true,
  parentId:    true,
  outletId:    true,
  isActive:    true,
  sortOrder:   true,
  createdAt:   true,
  updatedAt:   true,
  _count: { select: { children: true, products: true } },
} as const

export type CategoryRow = {
  id:          string
  name:        string
  slug:        string
  description: string | null
  imageUrl:    string | null
  parentId:    string | null
  outletId:    string | null
  isActive:    boolean
  sortOrder:   number
  createdAt:   Date
  updatedAt:   Date
  _count:      { children: number; products: number }
  children?:   CategoryRow[]
}

export const categoryRepository = {
  findAll(outletId: string, includeInactive = false): Promise<CategoryRow[]> {
    return prisma.category.findMany({
      where: {
        deletedAt: null,
        isActive:  includeInactive ? undefined : true,
        OR: [{ outletId }, { outletId: null }],
      },
      select:  categorySelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }) as Promise<CategoryRow[]>
  },

  findById(id: string): Promise<CategoryRow | null> {
    return prisma.category.findFirst({
      where:  { id, deletedAt: null },
      select: categorySelect,
    }) as Promise<CategoryRow | null>
  },

  findBySlugAndOutlet(slug: string, outletId: string | null): Promise<CategoryRow | null> {
    return prisma.category.findFirst({
      where:  { slug, outletId, deletedAt: null },
      select: categorySelect,
    }) as Promise<CategoryRow | null>
  },

  hasActiveChildren(id: string): Promise<boolean> {
    return prisma.category
      .count({ where: { parentId: id, deletedAt: null } })
      .then((n: number) => n > 0)
  },

  hasProducts(id: string): Promise<boolean> {
    return prisma.product
      .count({ where: { categoryId: id, deletedAt: null } })
      .then((n: number) => n > 0)
  },

  create(data: {
    name:         string
    slug:         string
    description?: string
    imageUrl?:    string
    parentId?:    string
    outletId?:    string
    sortOrder:    number
  }): Promise<CategoryRow> {
    return prisma.category.create({
      data,
      select: categorySelect,
    }) as Promise<CategoryRow>
  },

  update(
    id: string,
    data: {
      name?:        string
      slug?:        string
      description?: string
      imageUrl?:    string
      parentId?:    string | null
      isActive?:    boolean
      sortOrder?:   number
    },
  ): Promise<CategoryRow> {
    return prisma.category.update({
      where:  { id },
      data:   { ...data, updatedAt: new Date() },
      select: categorySelect,
    }) as Promise<CategoryRow>
  },

  softDelete(id: string): Promise<CategoryRow> {
    return prisma.category.update({
      where:  { id },
      data:   { deletedAt: new Date(), isActive: false },
      select: categorySelect,
    }) as Promise<CategoryRow>
  },
}
