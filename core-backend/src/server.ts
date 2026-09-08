import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit, { type Options } from 'express-rate-limit';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

import { env } from './config/env';
import { log } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';
import { startJobReconciliation } from './lib/jobReconciliation';
import { startJobWorker } from './lib/jobWorker';
import { requestContext } from './middleware/requestContext';
import { enforceOriginOnly, enforceOriginAndCsrf } from './middleware/csrf';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import jobsRoutes from './routes/jobs';

process.on('uncaughtException', (error) => {
  log('error', 'process.uncaught_exception', { error: error.message });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'process.unhandled_rejection', { reason: String(reason) });
});

const app = express();
const apiRouter = express.Router();

let limiterConfig: Partial<Options> = {
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
};

if (env.RATE_LIMIT_STORE === 'redis' && env.REDIS_URL) {
  try {
    const redis = require('redis');
    const RedisStore = require('rate-limit-redis');
    const client = redis.createClient({ url: env.REDIS_URL });
    limiterConfig.store = new RedisStore({ client });
    log('info', 'rate_limit.redis_enabled', { redisUrlConfigured: true });
  } catch (error) {
    log('warn', 'rate_limit.redis_fallback_to_memory', {
      error: error instanceof Error ? error.message : 'Unknown redis limiter fallback error',
    });
  }
}

const limiter = rateLimit(limiterConfig);

app.use(requestContext);
app.use(limiter);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const authBootstrapPaths = new Set(['/api/v1/auth/login', '/api/v1/auth/register']);
  if (authBootstrapPaths.has(req.originalUrl)) {
    return enforceOriginOnly(req, res, next);
  }
  return enforceOriginAndCsrf(req, res, next);
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/jobs', jobsRoutes);
app.use('/api/v1', apiRouter);
app.use(errorHandler);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'core-backend', version: 'v1' });
});

const workerTimer = startJobWorker();
const reconciliationTimer = startJobReconciliation();
const server = app.listen(env.PORT, () => {
  log('info', 'server.started', { port: env.PORT });
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'server.shutdown_started', { signal });
  clearInterval(workerTimer);
  clearInterval(reconciliationTimer);

  server.close(async () => {
    await disconnectPrisma();
    log('info', 'server.shutdown_complete', { signal });
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export default app;