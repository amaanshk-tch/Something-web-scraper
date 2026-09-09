import { Router, Response } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { SearchPayload } from '../../../contracts/api';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { log } from '../lib/logger';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

const router = Router();

function userRateLimitKey(req: AuthenticatedRequest): string {
  return req.user?.id ?? req.ip ?? 'unknown';
}

function rateLimitError(req: AuthenticatedRequest, res: Response, message: string): void {
  res.status(429).json({ error: { code: 'RATE_LIMITED', message, requestId: req.requestId } });
}

const createJobLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitError(req as AuthenticatedRequest, res, 'Too many job submissions. Please try again later.'),
});

// 60 list fetches per 15 min per user (pagination button clicks etc.)
const listJobsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: userRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitError(req as AuthenticatedRequest, res, 'Too many list requests. Please slow down.'),
});

// 120 polls per 15 min per user — allows ~1 req every 7.5 s for a full session
const getJobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: userRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitError(req as AuthenticatedRequest, res, 'Too many status polls. Please wait a moment.'),
});

const presentationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitError(req as AuthenticatedRequest, res, 'Too many report requests. Please try again later.'),
});

function sanitizeInputString(val: unknown, maxLen = 200): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // strip control chars
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, maxLen);
}

const conceptItemSchema = z.object({
  canonical: z
    .string()
    .transform((val) => sanitizeInputString(val, 80))
    .pipe(z.string().min(1).max(80)),
  aliases: z
    .array(
      z
        .string()
        .transform((val) => sanitizeInputString(val, 80))
        .pipe(z.string().min(1).max(80))
    )
    .max(10)
    .default([]),
  conceptType: z.string().max(40).default('semantic').optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const createJobSchema = z.object({
  topic: z
    .string()
    .transform((val) => sanitizeInputString(val, 200))
    .pipe(z.string().min(2, 'Topic must be at least 2 characters').max(200, 'Topic must be 200 characters or fewer')),
  keywords: z
    .array(
      z
        .string()
        .transform((val) => sanitizeInputString(val, 50))
        .pipe(z.string().min(1).max(50))
    )
    .max(20, 'No more than 20 keywords are allowed')
    .default([])
    .transform((arr) => Array.from(new Set(arr.map((k) => k.toLowerCase()))).slice(0, 20)),
  concepts: z
    .array(conceptItemSchema)
    .max(10, 'No more than 10 concept groups are allowed')
    .default([])
    .transform((arr) => arr.map((c) => ({
      canonical: c.canonical.toLowerCase(),
      aliases: Array.from(new Set(c.aliases.map((a) => a.toLowerCase()))).slice(0, 10),
      conceptType: c.conceptType ?? 'semantic',
      confidence: c.confidence ?? 1,
    }))),
  depth: z.number().int().min(1).max(15).default(5),
});

const jobsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

interface JobMeta {
  liveResultsOnly?: boolean;
}

const JOB_STAGE_MESSAGES: Record<string, string> = {
  QUEUED: 'Job accepted and waiting in queue.',
  PLANNING: 'Planning research path.',
  SEARCHING: 'Searching sources.',
  GENERATING_REPORT: 'Generating final report.',
  COMPLETED: 'Analysis complete.',
  FAILED: 'Analysis failed.',
  CANCELLED: 'Job cancelled.',
};

const JOB_STAGE_PROGRESS: Record<string, number> = {
  QUEUED: 5,
  PLANNING: 18,
  SEARCHING: 35,
  GENERATING_REPORT: 96,
  COMPLETED: 100,
  FAILED: 100,
  CANCELLED: 100,
};

function jobStreamPayload(status: string): { status: string; progress: number; message: string } {
  return {
    status,
    progress: JOB_STAGE_PROGRESS[status] ?? 0,
    message: JOB_STAGE_MESSAGES[status] ?? 'Working on your analysis.',
  };
}

interface StoredSentimentData {
  _meta?: JobMeta;
  [key: string]: unknown;
}

interface PresentationSource {
  sourceUrl: string;
  title: string;
  snippet: string;
  sentiment: string;
}

function sendError(res: Response, status: number, error: string, requestId?: string, code = 'INTERNAL_ERROR'): Response {
  return res.status(status).json({
    error: {
      code,
      message: error,
      requestId,
    },
  });
}

function buildContentDisposition(filename: string): string {
  const fallback = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

const JOB_STREAM_POLL_MS = 2500;
const JOB_STREAM_HEARTBEAT_MS = 15000;
const TERMINAL_JOB_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

interface JobStreamWatcher {
  userId: string;
  subscribers: Set<Response>;
  timer: NodeJS.Timeout;
}

const jobStreamWatchers = new Map<string, JobStreamWatcher>();

function removeJobStreamWatcher(jobId: string, watcher: JobStreamWatcher): void {
  if (jobStreamWatchers.get(jobId) === watcher) {
    jobStreamWatchers.delete(jobId);
  }
}

function getJobStreamWatcher(jobId: string, userId: string): JobStreamWatcher {
  const existing = jobStreamWatchers.get(jobId);
  if (existing) {
    return existing;
  }

  const watcher: JobStreamWatcher = {
    userId,
    subscribers: new Set<Response>(),
    timer: setInterval(async () => {
      try {
        const latest = await prisma.job.findFirst({
          where: { id: jobId, userId },
        });

        if (!latest) {
          for (const subscriber of watcher.subscribers) {
            try {
              subscriber.end();
            } catch {
              // Response already closed by the client.
            }
          }
          watcher.subscribers.clear();
          clearInterval(watcher.timer);
          removeJobStreamWatcher(jobId, watcher);
          return;
        }

        if (TERMINAL_JOB_STATUSES.has(latest.status)) {
          const payload = jobStreamPayload(latest.status);
          for (const subscriber of watcher.subscribers) {
            try {
              subscriber.write(`event: job_update\ndata: ${JSON.stringify(payload)}\n\n`);
              subscriber.end();
            } catch {
              // Response already closed by the client.
            }
          }
          watcher.subscribers.clear();
          clearInterval(watcher.timer);
          removeJobStreamWatcher(jobId, watcher);
          return;
        }

        const payload = jobStreamPayload(latest.status);
        for (const subscriber of watcher.subscribers) {
          try {
            subscriber.write(`event: job_update\ndata: ${JSON.stringify(payload)}\n\n`);
          } catch {
            // Response already closed by the client.
          }
        }
      } catch (error) {
        log('warn', 'job.stream_poll_failed', { jobId, userId, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }, JOB_STREAM_POLL_MS),
  };

  jobStreamWatchers.set(jobId, watcher);
  return watcher;
}

router.post('/', authenticateToken, createJobLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parseResult = createJobSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((error) => error.message).join(', ');
      return sendError(res, 400, formatted, req.requestId, 'INVALID_JOB_PARAMETERS');
    }

    const payload: SearchPayload = parseResult.data;
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          userId,
          requestId: req.requestId,
          topic: payload.topic,
          keywords: payload.keywords,
          depth: payload.depth,
          status: 'QUEUED',
        },
      });

      if (payload.concepts?.length) {
        await tx.concept.createMany({
          data: payload.concepts.map((concept) => ({
            jobId: job.id,
            canonical: concept.canonical,
            aliases: concept.aliases ?? [],
            conceptType: concept.conceptType ?? 'semantic',
            confidence: concept.confidence ?? 1,
          })),
        });
      }

      return job;
    });

    log('info', 'job.created', { requestId: req.requestId, jobId: result.id, userId, concepts: payload.concepts?.length ?? 0 });
    return res.status(202).json({ message: 'Job submitted successfully', jobId: result.id, status: 'QUEUED', requestId: req.requestId });
  } catch (error) {
    log('error', 'job.create_failed', { requestId: req.requestId, userId: req.user?.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 400, 'Invalid job parameters', req.requestId, 'INVALID_JOB_PARAMETERS');
  }
});

router.get('/', authenticateToken, listJobsLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parseResult = jobsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((error) => error.message).join(', ');
      return sendError(res, 400, formatted, req.requestId);
    }

    const { cursor, limit } = parseResult.data;
    const jobs = await prisma.job.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { results: true } } },
    });
    const hasMore = jobs.length > limit;
    const pageJobs = hasMore ? jobs.slice(0, limit) : jobs;
    return res.json({ jobs: pageJobs, nextCursor: hasMore ? pageJobs[pageJobs.length - 1]?.id ?? null : null });
  } catch (error) {
    log('error', 'jobs.list_failed', { requestId: req.requestId, userId: req.user?.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 500, 'Failed to retrieve jobs history', req.requestId);
  }
});

router.get('/:id/stream', authenticateToken, getJobLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) return sendError(res, 404, 'Job not found', req.requestId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const watcher = getJobStreamWatcher(job.id, req.user!.id);
    watcher.subscribers.add(res);

    const pushUpdate = (status: string, done = false) => {
      const payload = jobStreamPayload(status);
      res.write(`event: job_update\ndata: ${JSON.stringify(payload)}\n\n`);
      if (done) {
        res.end();
      }
    };

    pushUpdate(job.status);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        // Response already closed by the client.
      }
    }, JOB_STREAM_HEARTBEAT_MS);

    const cleanup = () => {
      try {
        clearInterval(heartbeat);
        if (watcher.subscribers.has(res)) {
          watcher.subscribers.delete(res);
        }
        if (watcher.subscribers.size === 0) {
          clearInterval(watcher.timer);
          removeJobStreamWatcher(job.id, watcher);
        }
      } catch {
        // Response already closed by the client.
      }
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
  } catch (error) {
    log('error', 'job.stream_failed', { requestId: req.requestId, jobId: req.params.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 500, 'Failed to stream job details', req.requestId);
  }
});

router.get('/:id', authenticateToken, getJobLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { results: { orderBy: { mentions: 'desc' } } },
    });
    if (!job) return sendError(res, 404, 'Job not found', req.requestId);

    const sentimentData = job.sentimentData as StoredSentimentData | null;
    const streamPayload = jobStreamPayload(job.status);
    return res.json({
      ...job,
      liveResultsOnly: sentimentData?._meta?.liveResultsOnly ?? job.results.length < job.depth,
      progress: streamPayload.progress,
      message: streamPayload.message,
      results: job.results,
    });
  } catch (error) {
    log('error', 'job.detail_failed', { requestId: req.requestId, jobId: req.params.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 500, 'Failed to fetch job details', req.requestId);
  }
});

router.get('/:id/presentation', authenticateToken, presentationLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { results: true },
    });
    if (!job) return sendError(res, 404, 'Job not found', req.requestId);
    if (job.status !== 'COMPLETED') return sendError(res, 400, 'Job is not completed yet', req.requestId);

    const rawSentimentData = job.sentimentData as StoredSentimentData | null;
    const metrics = Object.fromEntries(
      Object.entries(rawSentimentData ?? {}).filter(([label, value]) => !label.startsWith('_') && typeof value === 'number')
    ) as Record<string, number>;
    const sources: PresentationSource[] = job.results.map((source) => ({ sourceUrl: source.sourceUrl, title: source.title, snippet: source.snippet, sentiment: source.sentiment }));
    const requestId = job.requestId || req.requestId;

    const presRes = await axios.post(`${env.PRESENTATION_SERVICE_URL}/generate-presentation`, {
      topic: job.topic,
      bullets: job.bullets,
      metrics: Object.keys(metrics).length > 0 ? metrics : { Positive: 0, Negative: 0, Neutral: 0 },
      sources,
    }, {
      headers: {
        'X-Internal-Key': env.INTERNAL_SERVICE_KEY,
        'X-Request-Id': requestId,
        'X-User-Id': req.user!.id,
      },
      responseType: 'arraybuffer',
      timeout: 25_000,
    });

    const safeFilename = `Report_${job.topic.replace(/[^a-zA-Z0-9_.-]/g, '_')}.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', buildContentDisposition(safeFilename));
    return res.send(Buffer.from(presRes.data));
  } catch (error) {
    log('error', 'presentation.generate_failed', { requestId: req.requestId, jobId: req.params.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 500, 'Presentation generation failed', req.requestId);
  }
});

export default router;