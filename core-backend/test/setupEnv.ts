process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
process.env.INTERNAL_SERVICE_KEY = 'test-internal-service-key-ABCDEFGHIJ123456';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.RATE_LIMIT_STORE = 'memory';
process.env.REDIS_URL = '';