import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    session: { findUnique: jest.fn() },
    job: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    concept: { createMany: jest.fn() },
    source: { createMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

const app = createApp();
const ORIGIN = 'http://localhost:3000';
const CSRF = 'jobs-csrf-token';

const mockedJobFindFirst = prisma.job.findFirst as unknown as jest.Mock;
const mockedJobFindMany = prisma.job.findMany as unknown as jest.Mock;
const mockedTransaction = prisma.$transaction as unknown as jest.Mock;
const mockedQueryRaw = prisma.$queryRaw as unknown as jest.Mock;

let txJobCreate: jest.Mock;
let txConceptCreateMany: jest.Mock;

function signAccessToken(payload: { id: string; email: string; type?: string }) {
  return jwt.sign(
    { id: payload.id, email: payload.email, sub: payload.id, ...(payload.type ? { type: payload.type } : {}) },
    env.JWT_SECRET,
    { expiresIn: '15m', issuer: 'analytics-core-backend', audience: 'analytics-app' }
  );
}

const accessCookie = `token=${signAccessToken({ id: 'user-1', email: 'test@example.com' })}`;

function withCsrf(token: string) {
  return request(app)
    .post('/api/v1/jobs')
    .set('Origin', ORIGIN)
    .set('Cookie', [`csrf_token=${token}`])
    .set('x-csrf-token', token);
}

beforeEach(() => {
  jest.resetAllMocks();
  txJobCreate = jest.fn().mockResolvedValue({
    id: 'job-1',
    userId: 'user-1',
    requestId: 'req-1',
    topic: 'AI market trends',
    status: 'QUEUED',
  });
  txConceptCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  mockedTransaction.mockImplementation((cb: (tx: unknown) => unknown) => cb({
    job: { create: txJobCreate },
    concept: { createMany: txConceptCreateMany },
  }));
  mockedJobFindFirst.mockImplementation(() => Promise.resolve(null));
  mockedJobFindMany.mockImplementation(() => Promise.resolve([]));
});

describe('CSRF and origin enforcement', () => {
  it('rejects a POST with origin but no CSRF token', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Origin', ORIGIN)
      .set('Cookie', [accessCookie])
      .send({ topic: 'AI market trends' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid CSRF token.');
  });

  it('rejects a POST with CSRF token but no origin', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Cookie', [accessCookie, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF)
      .send({ topic: 'AI market trends' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Origin not allowed by origin validation.');
  });
});

describe('POST /api/v1/jobs', () => {
  it('requires an access token', async () => {
    const res = await withCsrf(CSRF).send({ topic: 'AI market trends' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Access token required');
  });

  it('rejects when given a refresh token instead of an access token', async () => {
    const refresh = signAccessToken({ id: 'user-1', email: 'test@example.com', type: 'refresh' });
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Origin', ORIGIN)
      .set('Cookie', [`token=${refresh}`, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF)
      .send({ topic: 'AI market trends' });

    expect(res.status).toBe(403);
  });

  it('creates a job with concepts and returns 202', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Origin', ORIGIN)
      .set('Cookie', [accessCookie, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF)
      .send({
        topic: 'AI market trends',
        keywords: ['ai', 'genai'],
        concepts: [{ canonical: 'generative-ai', aliases: ['genai'], conceptType: 'semantic', confidence: 0.9 }],
        depth: 3,
      });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe('job-1');
    expect(txJobCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', topic: 'AI market trends', status: 'QUEUED' }),
    }));
    expect(txConceptCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ canonical: 'generative-ai' })]) })
    );
  });

  it('rejects an invalid body with INVALID_JOB_PARAMETERS', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Origin', ORIGIN)
      .set('Cookie', [accessCookie, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF)
      .send({ topic: '', depth: 99 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JOB_PARAMETERS');
    expect(txJobCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/jobs (no CSRF required for safe methods)', () => {
  it('lists jobs for the authenticated user', async () => {
    mockedJobFindMany.mockResolvedValue([{ id: 'job-1', topic: 'AI market trends' }]);

    const res = await request(app).get('/api/v1/jobs').set('Cookie', [accessCookie]);

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.nextCursor).toBeNull();
  });

  it('returns the job detail for the authenticated user', async () => {
    mockedJobFindFirst.mockResolvedValue({
      id: 'job-1',
      topic: 'AI market trends',
      depth: 5,
      sentimentData: null,
      results: [],
      status: 'COMPLETED',
    });

    const res = await request(app).get('/api/v1/jobs/job-1').set('Cookie', [accessCookie]);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('job-1');
  });

  it('returns 404 when the job does not exist', async () => {
    const res = await request(app).get('/api/v1/jobs/job-missing').set('Cookie', [accessCookie]);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Job not found');
  });
});

describe('GET /health', () => {
  it('returns ok when the database is reachable', async () => {
    mockedQueryRaw.mockResolvedValue([{ '1': 1 }]);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(mockedQueryRaw).toHaveBeenCalled();
  });

  it('returns 503 when the database is unavailable', async () => {
    mockedQueryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('unavailable');
  });
});