import request from 'supertest';
import bcrypt from 'bcryptjs';
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
const PASSWORD = 'password-one-two-three';

const mockedUserFindUnique = prisma.user.findUnique as unknown as jest.Mock;
const mockedUserCreate = prisma.user.create as unknown as jest.Mock;
const mockedSessionFindUnique = prisma.session.findUnique as unknown as jest.Mock;
const mockedExecuteRaw = prisma.$executeRaw as unknown as jest.Mock;

function signRefreshToken(payload: { id: string; email: string }) {
  return jwt.sign(
    { id: payload.id, email: payload.email, sub: payload.id, type: 'refresh' },
    env.JWT_SECRET,
    { expiresIn: '30d', issuer: 'analytics-core-backend', audience: 'analytics-app' }
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedExecuteRaw.mockResolvedValue(undefined);
});

describe('POST /api/v1/auth/register (origin-only CSRF)', () => {
  it('creates a user and sets auth cookies', async () => {
    mockedUserFindUnique.mockResolvedValue(null);
    mockedUserCreate.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'new', createdAt: new Date() });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: 'new@example.com', password: PASSWORD, name: 'new' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@example.com');
    expect(mockedUserCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'new@example.com' }),
    }));
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('csrf_token='))).toBe(true);
  });

  it('rejects when the email is already registered', async () => {
    mockedUserFindUnique.mockResolvedValue({ id: 'user-1', email: 'dup@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: 'dup@example.com', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(mockedUserCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid request body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: 'not-an-email', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(mockedUserCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/login (origin-only CSRF)', () => {
  it('returns the user and sets auth cookies on valid credentials', async () => {
    const passwordHash = bcrypt.hashSync(PASSWORD, 10);
    mockedUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'login@example.com',
      passwordHash,
      name: 'login',
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'login@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('login@example.com');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('csrf_token='))).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    mockedUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'login@example.com',
      passwordHash: bcrypt.hashSync(PASSWORD, 10),
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'login@example.com', password: 'wrong-password' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/refresh (origin + CSRF)', () => {
  const CSRF = 'refresh-csrf-token';

  it('issues a new access token, rotates the refresh token, and revokes the old session', async () => {
    const staleEmail = 'stale@example.com';
    const currentEmail = 'current@example.com';
    const refreshToken = signRefreshToken({ id: 'user-1', email: staleEmail });
    mockedSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockedUserFindUnique.mockResolvedValue({ id: 'user-1', email: currentEmail });
    mockedExecuteRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', [`refresh_token=${refreshToken}`, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF);

    expect(res.status).toBe(200);
    expect(mockedUserFindUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { id: true, email: true } });
    expect(res.body.user.email).toBe(currentEmail);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    const rotatedRefresh = cookies.find((c) => c.startsWith('refresh_token='));
    expect(rotatedRefresh).toBeDefined();
    expect(rotatedRefresh).not.toContain(refreshToken);
    // The old session was revoked and a new one created (2 $executeRaw calls)
    expect(mockedExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it('detects refresh token reuse and revokes all of the user\'s sessions', async () => {
    const refreshToken = signRefreshToken({ id: 'user-1', email: 'user@example.com' });
    mockedSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    // The atomic revoke affects 0 rows: the token was already rotated.
    mockedExecuteRaw.mockResolvedValueOnce(0);
    mockedUserFindUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', [`refresh_token=${refreshToken}`, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid refresh token');
    // revoke-this-session (returned 0) + revoke-every-session = 2 $executeRaw calls
    expect(mockedExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockedUserFindUnique).not.toHaveBeenCalled();
  });

  it('rejects when the session has no matching user row', async () => {
    const refreshToken = signRefreshToken({ id: 'user-ghost', email: 'ghost@example.com' });
    mockedSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-ghost',
      refreshTokenHash: 'hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockedUserFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', [`refresh_token=${refreshToken}`, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('User not found');
  });

  it('rejects when no refresh token cookie is present', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', [`csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Refresh token required');
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', [`refresh_token=not-a-jwt`, `csrf_token=${CSRF}`])
      .set('x-csrf-token', CSRF);

    expect(res.status).toBe(403);
  });
});