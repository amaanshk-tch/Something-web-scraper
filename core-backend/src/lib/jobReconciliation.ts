import { prisma } from './prisma';
import { log } from './logger';

const STALE_JOB_THRESHOLD_MS = 3 * 60 * 1000;
const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;

export async function reconcileStaleJobs(): Promise<number> {
  try {
    const staleCutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
    const result = await prisma.job.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: staleCutoff } },
      data: { status: 'FAILED', errorMessage: 'Job timed out after exceeding processing duration limit.' },
    });

    if (result.count > 0) log('warn', 'jobs.reconciled_stale', { count: result.count });
    return result.count;
  } catch (error) {
    log('error', 'jobs.reconciliation_failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    return 0;
  }
}

export function startJobReconciliation(): NodeJS.Timeout {
  void reconcileStaleJobs();
  return setInterval(() => void reconcileStaleJobs(), RECONCILIATION_INTERVAL_MS);
}