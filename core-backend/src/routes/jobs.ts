import { Router, Response } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { SearchPayload } from '@contracts/api';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { log } from '../lib/logger';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

const router = Router();

function userRateLimitKey(req: AuthenticatedRequest): string {
  return req.user?.id ?? req.ip ?? 'unknown';
}

function rateLimitError(req: AuthenticatedRequest, res: Response, message: string): void {
  res.status(429).json({ error: message, requestId: req.requestId });
}

const createJobLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitError(req as AuthenticatedRequest, res, 'Too many job submissions. Please try again later.'),
});

const presentationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitError(req as AuthenticatedRequest, res, 'Too many report requests. Please try again later.'),
});

const createJobSchema = z.object({
  topic: z.string().trim().min(2, 'Topic must be at least 2 characters').max(200, 'Topic must be 200 characters or fewer'),
  keywords: z.array(z.string().trim().min(1).max(80, 'Each keyword must be 80 characters or fewer')).max(20, 'No more than 20 keywords are allowed').default([]),
  depth: z.number().int().min(1).max(15).default(5),
});

const jobsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

interface JobMeta {
  liveResultsOnly?: boolean;
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

function sendError(res: Response, status: number, error: string, requestId?: string): Response {
  return res.status(status).json({ error, requestId });
}

router.post('/', authenticateToken, createJobLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parseResult = createJobSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((error) => error.message).join(', ');
      return sendError(res, 400, formatted, req.requestId);
    }

    const payload: SearchPayload = parseResult.data;
    const job = await prisma.job.create({
      data: {
        userId,
        requestId: req.requestId,
        topic: payload.topic,
        keywords: payload.keywords,
        depth: payload.depth,
        status: 'PENDING',
      },
    });

    log('info', 'job.created', { requestId: req.requestId, jobId: job.id, userId });
    return res.status(202).json({ message: 'Job submitted successfully', jobId: job.id, status: job.status, requestId: req.requestId });
  } catch (error) {
    log('error', 'job.create_failed', { requestId: req.requestId, userId: req.user?.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 400, 'Invalid job parameters', req.requestId);
  }
});

router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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

router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { results: { orderBy: { mentions: 'desc' } } },
    });
    if (!job) return sendError(res, 404, 'Job not found', req.requestId);

    const sentimentData = job.sentimentData as StoredSentimentData | null;
    return res.json({ ...job, liveResultsOnly: sentimentData?._meta?.liveResultsOnly ?? job.results.length < job.depth });
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
    const sources: PresentationSource[] = job.results.map((result) => ({ sourceUrl: result.sourceUrl, title: result.title, snippet: result.snippet, sentiment: result.sentiment }));
    const requestId = job.requestId || req.requestId;

    const presRes = await axios.post(`${env.PRESENTATION_SERVICE_URL}/generate-presentation`, {
      topic: job.topic,
      bullets: job.bullets,
      metrics: Object.keys(metrics).length > 0 ? metrics : { Positive: 0, Negative: 0, Neutral: 0 },
      sources,
    }, {
      headers: { 'X-Internal-Key': env.INTERNAL_SERVICE_KEY, 'X-Request-Id': requestId },
      responseType: 'arraybuffer',
      timeout: 25_000,
    });

    const safeFilename = `Report_${job.topic.replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(Buffer.from(presRes.data));
  } catch (error) {
    log('error', 'presentation.generate_failed', { requestId: req.requestId, jobId: req.params.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return sendError(res, 500, 'Presentation generation failed', req.requestId);
  }
});

export default router;