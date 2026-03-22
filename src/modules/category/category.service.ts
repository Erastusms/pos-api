import { categoryRepository, type CategoryRow } from './category.repository'
import type { CreateCategoryInput, UpdateCategoryInput, ListCategoryQuery } from './category.schema'
import { slugify } from '../../shared/utils/slug'
import { ConflictError, NotFoundError, BadRequestError } from '../../shared/errors'

// ─── Tree builder ─────────────────────────────────────────────────────────────

/**
 * Convert flat list ke nested tree structure dalam O(n).
 * Menggunakan Map untuk lookup O(1) per node.
 */
function buildTree(flat: CategoryRow[]): CategoryRow[] {
  const map = new Map<string, CategoryRow>()
  const roots: CategoryRow[] = []

  // Pass 1: index semua node
  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [] })
  }

  // Pass 2: assign children ke parent masing-masing
  for (const cat of flat) {
    const node = map.get(cat.id)!
    if (cat.parentId && map.has(cat.parentId)) {
      const parent = map.get(cat.parentId)!
      parent.children = parent.children ?? []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const categoryService = {
  async list(outletId: string, query: ListCategoryQuery) {
    const flat = await categoryRepository.findAll(outletId, query.includeInactive)

    if (query.tree) {
      return buildTree(flat)
    }

    // Flat list — filter by parentId jika diminta
    if (query.parentId !== undefined) {
      const parentId = query.parentId === '' ? null : query.parentId
      return flat.filter((c) => c.parentId === parentId)
    }

    return flat
  },

  async getById(id: string) {
    const category = await categoryRepository.findById(id)
    if (!category) throw new NotFoundError('Kategori', 'CATEGORY_NOT_FOUND')
    return category
  },

  async create(input: CreateCategoryInput, outletId: string) {
    const slug = input.slug ?? slugify(input.name)

    // Validasi slug unik dalam outlet yang sama
    const existing = await categoryRepository.findBySlugAndOutlet(slug, outletId)
    if (existing) {
      throw new ConflictError(
        `Slug "${slug}" sudah digunakan di outlet ini`,
        'CATEGORY_SLUG_EXISTS',
      )
    }

    // Validasi parent ada jika diberikan
    if (input.parentId) {
      const parent = await categoryRepository.findById(input.parentId)
      if (!parent) throw new NotFoundError('Kategori parent', 'PARENT_CATEGORY_NOT_FOUND')

      // Cegah nesting lebih dari 2 level (root → level1 → level2)
      if (parent.parentId) {
        throw new BadRequestError(
          'Kategori hanya mendukung maksimal 2 level kedalaman',
          'MAX_DEPTH_EXCEEDED',
        )
      }
    }

    return categoryRepository.create({ ...input, slug, outletId })
  },

  async update(id: string, input: UpdateCategoryInput, outletId: string) {
    const category = await categoryRepository.findById(id)
    if (!category) throw new NotFoundError('Kategori', 'CATEGORY_NOT_FOUND')

    // Jika slug berubah, pastikan masih unik
    if (input.slug && input.slug !== category.slug) {
      const conflict = await categoryRepository.findBySlugAndOutlet(input.slug, outletId)
      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `Slug "${input.slug}" sudah digunakan`,
          'CATEGORY_SLUG_EXISTS',
        )
      }
    }

    // Jika nama berubah dan slug tidak diberikan → auto-update slug
    const newSlug =
      input.slug ??
      (input.name && input.name !== category.name ? slugify(input.name) : undefined)

    // Validasi parent baru jika diberikan
    if (input.parentId) {
      if (input.parentId === id) {
        throw new BadRequestError('Kategori tidak bisa menjadi parent dirinya sendiri', 'CIRCULAR_REFERENCE')
      }
      const parent = await categoryRepository.findById(input.parentId)
      if (!parent) throw new NotFoundError('Kategori parent', 'PARENT_CATEGORY_NOT_FOUND')
      if (parent.parentId) {
        throw new BadRequestError('Maksimal 2 level kedalaman', 'MAX_DEPTH_EXCEEDED')
      }
    }

    return categoryRepository.update(id, { ...input, ...(newSlug ? { slug: newSlug } : {}) })
  },

  async delete(id: string) {
    const category = await categoryRepository.findById(id)
    if (!category) throw new NotFoundError('Kategori', 'CATEGORY_NOT_FOUND')

    if (await categoryRepository.hasActiveChildren(id)) {
      throw new BadRequestError(
        'Kategori masih memiliki sub-kategori aktif. Hapus atau pindahkan sub-kategori terlebih dahulu.',
        'CATEGORY_HAS_CHILDREN',
      )
    }

    if (await categoryRepository.hasProducts(id)) {
      throw new BadRequestError(
        'Kategori masih digunakan oleh produk. Pindahkan produk ke kategori lain terlebih dahulu.',
        'CATEGORY_HAS_PRODUCTS',
      )
    }

    return categoryRepository.softDelete(id)
  },
}
