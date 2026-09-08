import axios from 'axios';
import { env } from '../config/env';
import { log } from './logger';
import { prisma } from './prisma';

// Queue-backed orchestration should be moved behind a durable queue such as
// Redis/BullMQ or another shared job broker so that each API process does not
// own a local in-memory semaphore. This repository currently uses a DB polling
// queue with a process-local MAX_CONCURRENT gate.
const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 3_000;

interface DataEngineResult {
  sourceUrl: string;
  canonicalUrl?: string;
  title: string;
  snippet: string;
  sentiment?: string;
  mentions?: number;
  domain?: string;
  sourceType?: 'WEB' | 'NEWS' | 'BLOG' | 'PDF' | 'SOCIAL' | 'VIDEO' | 'OTHER';
  publishedAt?: string;
  retrievedAt?: string;
  author?: string;
  publisher?: string;
  contentHash?: string;
  wordCount?: number;
  language?: string;
  relevanceScore?: number;
  credibilityScore?: number;
  duplicateGroup?: string;
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
    SET status = 'PLANNING', "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED'
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
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'SEARCHING' },
    });

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

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FETCHING' },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'ANALYZING' },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'SYNTHESIZING' },
    });

    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', sentimentData: sentimentPayload, bullets: bullets ?? [] },
      });

      if (results?.length) {
        await tx.source.createMany({
          data: results.map((result) => ({
            jobId,
            sourceUrl: result.sourceUrl,
            canonicalUrl: result.canonicalUrl,
            title: result.title,
            snippet: result.snippet,
            sentiment: result.sentiment ?? 'neutral',
            mentions: result.mentions ?? 1,
            domain: result.domain,
            sourceType: result.sourceType ?? 'WEB',
            publishedAt: result.publishedAt ? new Date(result.publishedAt) : null,
            retrievedAt: result.retrievedAt ? new Date(result.retrievedAt) : new Date(),
            author: result.author,
            publisher: result.publisher,
            contentHash: result.contentHash,
            wordCount: result.wordCount,
            language: result.language ?? 'en',
            relevanceScore: result.relevanceScore,
            credibilityScore: result.credibilityScore,
            duplicateGroup: result.duplicateGroup,
          })),
        });
      }
    });

    log('info', 'job.completed', { requestId: job.requestId, jobId, durationMs: Date.now() - startedAt, results: results?.length ?? 0 });
  } catch (error) {
    let code = 'DATA_ENGINE_ERROR';
    let message = 'Data extraction failed. Please retry.';

    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      code = 'DATA_ENGINE_TIMEOUT';
      message = 'Research provider timed out.';
    } else if (axios.isAxiosError(error) && error.response?.status === 500) {
      code = 'DATA_ENGINE_INTERNAL_ERROR';
      message = 'Research provider returned an internal error.';
    }

    log('error', 'job.failed', {
      requestId: job.requestId,
      jobId,
      durationMs: Date.now() - startedAt,
      code,
      provider: 'duckduckgo',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: message, errorCode: code },
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