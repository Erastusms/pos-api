import { buildApp } from './config/app'
import { env } from './config/env'
import { prisma } from './infrastructure/database/prisma.client'
import { redis } from './infrastructure/cache/redis.client'

async function start() {
  const app = await buildApp()

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const gracefulShutdown = async (signal: string) => {
    console.info(`\n⏳ Received ${signal}, shutting down gracefully...`)
    try {
      await app.close()
      await prisma.$disconnect()
      await redis.quit()
      console.info('✅ Server closed cleanly')
      process.exit(0)
    } catch (err) {
      console.error('❌ Error during shutdown:', err)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  // ── Unhandled rejections ───────────────────────────────────────────────────
  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled promise rejection:', reason)
    // In production, exit and let the process manager (PM2/Docker) restart
    if (env.NODE_ENV === 'production') process.exit(1)
  })

  // ── Start server ───────────────────────────────────────────────────────────
  try {
    await app.listen({ port: env.PORT, host: env.HOST })
    console.info(`\n🚀 POS API running at http://${env.HOST}:${env.PORT}`)
    console.info(`📖 API Docs     : http://localhost:${env.PORT}/docs`)
    console.info(`❤️  Health check : http://localhost:${env.PORT}/health`)
    console.info(`🌍 Environment  : ${env.NODE_ENV}\n`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
