import { log } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';
import { startJobReconciliation } from './lib/jobReconciliation';
import { startJobWorker } from './lib/jobWorker';
import { createApp } from './app';
import { env } from './config/env';

process.on('uncaughtException', (error) => {
  log('error', 'process.uncaught_exception', { error: error.message });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'process.unhandled_rejection', { reason: String(reason) });
});

const app = createApp();

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