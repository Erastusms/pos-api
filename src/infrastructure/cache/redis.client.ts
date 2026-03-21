import Redis from 'ioredis'
import { env } from '../../config/env'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,      // don't connect until first command
    enableReadyCheck: true,
    retryStrategy: (times) => {
      if (times > 3) return null  // stop retrying after 3 attempts
      return Math.min(times * 200, 1000)
    },
  })

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

redis.on('connect', () => {
  console.info('✅ Redis connected')
})

redis.on('error', (err) => {
  // Log but don't crash — app works without Redis (cache degraded gracefully)
  console.warn('⚠️  Redis error (cache degraded):', err.message)
})
