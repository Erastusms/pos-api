import { prisma } from '../../infrastructure/database/prisma.client'

const customerSelect = {
  id: true,
  code: true,
  name: true,
  email: true,
  phone: true,
  gender: true,
  birthDate: true,
  notes: true,
  totalPoints: true,
  totalSpent: true,
  totalTransactions: true,
  lastTransactionAt: true,
  isMember: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const

export const customerRepository = {
  findMany(outletId: string, search?: string) {
    return prisma.customer.findMany({
      where: {
        outletId,
        deletedAt: null,
        OR: search
          ? [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      select: customerSelect,
      orderBy: {
        createdAt: 'desc',
      },
    })
  },

  findById(id: string) {
    return prisma.customer.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: customerSelect,
    })
  },

  create(data: any) {
    return prisma.customer.create({
      data,
      select: customerSelect,
    })
  },

  update(id: string, data: any) {
    return prisma.customer.update({
      where: { id },
      data,
      select: customerSelect,
    })
  },

  softDelete(id: string) {
    return prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      select: customerSelect,
    })
  },
}
