import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from './auth.service'
import { registerSchema, loginSchema, refreshTokenSchema, logoutSchema } from './auth.schema'
import { sendSuccess } from '../../shared/utils/response'
import { ValidationError } from '../../shared/errors'
import { UnauthorizedError } from '../../shared/errors'
import { z } from 'zod'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate request body with a Zod schema.
 * Throws a formatted ValidationError on failure.
 */
function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      field: e.path.join('.') || 'body',
      message: e.message,
    }))
    throw new ValidationError('Validasi input gagal', details)
  }
  return result.data
}

function getClientMeta(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export const authController = {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody(registerSchema, request.body)
    const user = await authService.register(input, getClientMeta(request))
    return sendSuccess(reply, user, 'Registrasi berhasil', 201)
  },

  async login(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody(loginSchema, request.body)
    const result = await authService.login(input, getClientMeta(request))
    return sendSuccess(reply, result, 'Login berhasil')
  },

  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody(refreshTokenSchema, request.body)
    const result = await authService.refreshToken(input.refreshToken, getClientMeta(request))
    return sendSuccess(reply, result, 'Token berhasil diperbarui')
  },

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const input = validateBody(logoutSchema, request.body)

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token autentikasi tidak ditemukan', 'MISSING_TOKEN')
    }
    const accessToken = authHeader.slice(7)

    await authService.logout(accessToken, input.refreshToken, {
      userId: request.user?.id,
      ...getClientMeta(request),
    })

    return sendSuccess(reply, null, 'Logout berhasil')
  },

  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization ?? ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    await authService.logoutAll(request.user.id, accessToken)
    return sendSuccess(reply, null, 'Semua sesi berhasil dihapus')
  },

  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const user = await authService.getProfile(request.user.id)
    return sendSuccess(reply, user)
  },

  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    const changePasswordSchema = z.object({
      currentPassword: z.string().min(1, 'Password lama wajib diisi'),
      newPassword: z
        .string()
        .min(8, 'Password baru minimal 8 karakter')
        .max(72)
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          'Password harus mengandung huruf besar, huruf kecil, dan angka',
        ),
    })

    const input = validateBody(changePasswordSchema, request.body)
    const result = await authService.changePassword(
      request.user.id,
      input.currentPassword,
      input.newPassword,
      getClientMeta(request),
    )
    return sendSuccess(reply, result, 'Password berhasil diubah. Silakan login kembali.')
  },
}
