import { PrismaClient } from '@prisma/client'
import { env } from '../../config/env'

// Prevent multiple Prisma instances in development (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  })

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
