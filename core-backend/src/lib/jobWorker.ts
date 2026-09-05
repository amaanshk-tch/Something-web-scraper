import axios from 'axios';
import { env } from '../config/env';
import { log } from './logger';
import { prisma } from './prisma';

const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 3_000;

interface DataEngineResult {
  sourceUrl: string;
  title: string;
  snippet: string;
  sentiment: string;
  mentions?: number;
}

interface DataEngineResponse {
  sentimentMetrics?: Record<string, number>;
  bullets?: string[];
  results?: DataEngineResult[];
  liveResultsOnly?: boolean;
}

let activeJobs = 0;

async function claimNextJob(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job"
    SET status = 'PROCESSING', "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

async function processJob(jobId: string): Promise<void> {
  const startedAt = Date.now();
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const engineRes = await axios.post<DataEngineResponse>(
      `${env.DATA_ENGINE_URL}/scrape`,
      { topic: job.topic, keywords: job.keywords, depth: job.depth },
      {
        headers: { 'X-Internal-Key': env.INTERNAL_SERVICE_KEY, 'X-Request-Id': job.requestId ?? jobId },
        timeout: 60_000,
      }
    );

    const { sentimentMetrics, bullets, results, liveResultsOnly } = engineRes.data;
    const sentimentPayload = {
      ...(sentimentMetrics || {}),
      _meta: {
        liveResultsOnly: !!liveResultsOnly,
        depthRequested: job.depth,
        resultsFound: results?.length ?? 0,
      },
    };

    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', sentimentData: sentimentPayload, bullets: bullets ?? [] },
      });

      if (results?.length) {
        await tx.result.createMany({
          data: results.map((result) => ({
            jobId,
            sourceUrl: result.sourceUrl,
            title: result.title,
            snippet: result.snippet,
            sentiment: result.sentiment,
            mentions: result.mentions ?? 1,
          })),
        });
      }
    });

    log('info', 'job.completed', { requestId: job.requestId, jobId, durationMs: Date.now() - startedAt, results: results?.length ?? 0 });
  } catch (error) {
    log('error', 'job.failed', {
      requestId: job.requestId,
      jobId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'Data extraction failed. Please retry.' },
    });
  }
}

async function pollAndProcess(): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT) return;

  try {
    const jobId = await claimNextJob();
    if (!jobId) return;

    activeJobs += 1;
    void processJob(jobId).finally(() => { activeJobs -= 1; });
  } catch (error) {
    log('error', 'job.poll_failed', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export function startJobWorker(): NodeJS.Timeout {
  log('info', 'job_worker.started', { pollIntervalMs: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT });
  return setInterval(() => void pollAndProcess(), POLL_INTERVAL_MS);
}