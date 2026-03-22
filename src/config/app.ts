import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './env'
import { errorHandler } from '../shared/errors'
import { authRoutes } from '../modules/auth/auth.routes'

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
    // Trust the first proxy (important for getting real client IP)
    trustProxy: true,
    ajv: {
      customOptions: {
        strict: 'log',
        keywords: ['example'],
        allErrors: true,
      },
    },
  })

  // ─── Security plugins ───────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // disabled for Swagger UI
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Do NOT set errorResponseBuilder — let the global error handler format it
    // so the response shape is consistent with all other errors
  })

  // ─── API Documentation ──────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'POS System API',
        description: 'REST API untuk sistem Point of Sale',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Masukkan access token JWT',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Autentikasi & Otorisasi' },
        { name: 'Health', description: 'Status server' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  // ─── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler(errorHandler)

  // ─── Routes ─────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/v1/auth' })

  // ─── Health check ────────────────────────────────────────────────────────────
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
    async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }),
  )

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested endpoint does not exist',
      },
    })
  })

  return app
}
