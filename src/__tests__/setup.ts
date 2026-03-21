// Set required env vars before any module is loaded in tests
process.env['NODE_ENV'] = 'test'
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/testdb'
process.env['REDIS_URL'] = 'redis://localhost:6379'
process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-minimum-32-characters-long'
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-minimum-32-characters-long'
process.env['JWT_ACCESS_EXPIRES_IN'] = '15m'
process.env['JWT_REFRESH_EXPIRES_IN_DAYS'] = '7'
process.env['BCRYPT_ROUNDS'] = '4' // Lower rounds = faster tests
process.env['RATE_LIMIT_MAX'] = '100'
process.env['RATE_LIMIT_WINDOW_MS'] = '60000'
process.env['CORS_ORIGIN'] = '*'
process.env['PORT'] = '3001'
process.env['HOST'] = '127.0.0.1'
