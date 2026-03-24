import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import multipart from '@fastify/multipart'
import { env } from './env'
import { errorHandler } from '../shared/errors'
import { authRoutes } from '../modules/auth/auth.routes'
import { categoryRoutes } from '../modules/category/category.routes'
import { inventoryRoutes } from '../modules/inventory/inventory.routes'
import { employeeRoutes } from '../modules/employee/employee.routes'
import { productRoutes } from '../modules/product/product.routes'

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV !== 'test'
        ? {
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
                : undefined,
          }
        : false,
    trustProxy: true,
    ajv: {
      customOptions: {
        strict: 'log',
        keywords: ['example'],
        allErrors: true,
      },
    },
  })

  // ── Security plugins ──────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  })

  // ── Multipart (file upload) ────────────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
      files: 1,
      fieldSize: 1024,
    },
  })

  // ── Static file serving for uploaded images ───────────────────────────────
  // In production replace with CDN/S3 URL. For development, serve locally.
  if (env.NODE_ENV === 'development') {
    const fastifyStatic = await import('@fastify/static')
    const path = await import('path')
    await app.register(fastifyStatic.default, {
      root: path.resolve('uploads'),
      prefix: '/uploads/',
    })
  }

  // ── API Documentation ──────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'POS System API',
        description: 'REST API untuk sistem Point of Sale',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: 'Development server' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'Health', description: 'Status server' },
        { name: 'Auth', description: 'Autentikasi & Otorisasi' },
        { name: 'Category', description: 'Manajemen kategori produk' },
        { name: 'Inventory', description: 'Manajemen stok & HPP (FIFO)' },
        { name: 'Employee', description: 'Manajemen karyawan & jadwal shift' },
        { name: 'Product', description: 'Manajemen produk, variant, modifier, foto' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler(errorHandler)

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(categoryRoutes, { prefix: '/api/v1/categories' })
  await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' })
  await app.register(employeeRoutes, { prefix: '/api/v1/employees' })
  await app.register(productRoutes, { prefix: '/api/v1/products' })

  // ── Health check ──────────────────────────────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Server health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() }),
  )

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'The requested endpoint does not exist' },
    })
  })

  return app
}
