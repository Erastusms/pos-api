import type { FastifyInstance } from 'fastify'
import { authController } from './auth.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { userProfileSchema, authTokensSchema } from './auth.schema'

// ─── Reusable response schemas ────────────────────────────────────────────────

const successResponse = (dataSchema: object, description = 'Berhasil') => ({
  type: 'object',
  description,
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data: dataSchema,
  },
})

const errorResponse = (description: string) => ({
  type: 'object',
  description,
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  },
})

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/register ────────────────────────────────────────────────────
  app.post(
    '/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Daftar akun baru',
        description:
          'Membuat akun user baru. Secara default role adalah Cashier (roleId: 4). Untuk membuat Owner atau Manager, gunakan akun Super Admin.',
        body: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', minLength: 2, example: 'Budi Santoso' },
            email: { type: 'string', format: 'email', example: 'budi@tokosaya.com' },
            password: {
              type: 'string',
              minLength: 8,
              example: 'Password123',
              description: 'Minimal 8 karakter, mengandung huruf besar, kecil, dan angka',
            },
            phone: { type: 'string', example: '081234567890' },
            outletId: { type: 'string', example: 'default-outlet-001' },
            roleId: {
              type: 'number',
              enum: [1, 2, 3, 4],
              default: 4,
              description: '1=Super Admin, 2=Owner, 3=Manager, 4=Cashier',
            },
          },
        },
        response: {
          201: successResponse(userProfileSchema, 'Registrasi berhasil'),
          409: errorResponse('Email sudah terdaftar'),
          422: errorResponse('Validasi input gagal'),
        },
      },
    },
    authController.register,
  )

  // ── POST /auth/login ───────────────────────────────────────────────────────
  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Login dengan email & password',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@pos.com' },
            password: { type: 'string', example: 'Admin@123' },
            deviceInfo: { type: 'string', description: 'Identifikasi perangkat (opsional)' },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                user: userProfileSchema,
                tokens: authTokensSchema,
              },
            },
            'Login berhasil',
          ),
          401: errorResponse('Email atau password salah'),
          422: errorResponse('Validasi input gagal'),
        },
      },
    },
    authController.login,
  )

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  app.post(
    '/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Perbarui access token',
        description:
          'Gunakan refresh token untuk mendapatkan access token & refresh token baru. Refresh token lama langsung diinvalidasi (rotation).',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        response: {
          200: successResponse(
            {
              type: 'object',
              properties: {
                user: userProfileSchema,
                tokens: authTokensSchema,
              },
            },
            'Token berhasil diperbarui',
          ),
          401: errorResponse('Refresh token tidak valid atau sudah kadaluarsa'),
        },
      },
    },
    authController.refreshToken,
  )

  // ── POST /auth/logout ──────────────────────────────────────────────────────
  app.post(
    '/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Logout sesi ini',
        description: 'Invalidasi access token dan refresh token untuk sesi saat ini.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        response: {
          200: successResponse({ type: 'null' }, 'Logout berhasil'),
          401: errorResponse('Token tidak valid'),
        },
      },
    },
    authController.logout,
  )

  // ── POST /auth/logout-all (requires auth) ─────────────────────────────────
  app.post(
    '/logout-all',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Logout dari semua perangkat',
        description:
          'Invalidasi semua refresh token yang aktif untuk akun ini (logout dari semua device).',
        security: [{ bearerAuth: [] }],
        response: {
          200: successResponse({ type: 'null' }, 'Semua sesi dihapus'),
          401: errorResponse('Token tidak valid'),
        },
      },
    },
    authController.logoutAll,
  )

  // ── GET /auth/me (requires auth) ──────────────────────────────────────────
  app.get(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Ambil profil user yang sedang login',
        security: [{ bearerAuth: [] }],
        response: {
          200: successResponse(userProfileSchema, 'Data profil'),
          401: errorResponse('Token tidak valid'),
        },
      },
    },
    authController.getProfile,
  )

  // ── POST /auth/change-password (requires auth) ────────────────────────────
  app.post(
    '/change-password',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Ubah password',
        description: 'Mengubah password. Semua sesi aktif di perangkat lain akan dihapus otomatis.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: {
              type: 'string',
              minLength: 8,
              description: 'Minimal 8 karakter, huruf besar, kecil, dan angka',
            },
          },
        },
        response: {
          200: successResponse({ type: 'object' }, 'Password berhasil diubah'),
          400: errorResponse('Password lama salah'),
          401: errorResponse('Token tidak valid'),
          422: errorResponse('Validasi input gagal'),
        },
      },
    },
    authController.changePassword,
  )
}
