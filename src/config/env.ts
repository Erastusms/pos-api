import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  // ─── App ───────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10)),
  HOST: z.string().default('0.0.0.0'),

  // ─── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // ─── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // ─── JWT ───────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z
    .string()
    .default('7')
    .transform((v) => parseInt(v, 10)),

  // ─── Security ──────────────────────────────────────────────────────────────
  BCRYPT_ROUNDS: z
    .string()
    .default('12')
    .transform((v) => parseInt(v, 10)),
  RATE_LIMIT_MAX: z
    .string()
    .default('100')
    .transform((v) => parseInt(v, 10)),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((v) => parseInt(v, 10)),

  // ─── CORS ──────────────────────────────────────────────────────────────────
  CORS_ORIGIN: z.string().default('*'),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌ Invalid environment variables:')
  const formatted = result.error.format()
  Object.entries(formatted).forEach(([key, value]) => {
    if (key !== '_errors' && value && typeof value === 'object' && '_errors' in value) {
      const errors = (value as { _errors: string[] })._errors
      if (errors.length > 0) {
        console.error(`  ${key}: ${errors.join(', ')}`)
      }
    }
  })
  process.exit(1)
}

export const env = result.data
export type Env = typeof env
