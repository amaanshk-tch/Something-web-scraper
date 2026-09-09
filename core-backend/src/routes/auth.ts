import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { log } from '../lib/logger';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Prevent logout endpoint from being hammered (cookie clearing)
const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many logout requests. Please try again later.' },
});

// /me is called on every page load — allow reasonable frequency but cap abuse
const meLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many profile requests. Please try again later.' },
});

function sanitizeAuthString(val: unknown, maxLen = 80): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // strip control chars
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, maxLen);
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createServerSession(user: { id: string; email: string }, refreshToken: string, req: AuthenticatedRequest) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const userAgent = Array.isArray(req.headers['user-agent'])
    ? req.headers['user-agent'][0]
    : req.headers['user-agent'] || 'unknown';
  const ipAddress = req.ip || (Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for']) || 'unknown';
  const deviceName = Array.isArray(req.headers['x-device-name'])
    ? req.headers['x-device-name'][0]
    : req.headers['x-device-name'] || 'web';

  await prisma.$executeRaw`
    INSERT INTO "Session" ("id", "userId", "refreshTokenHash", "userAgent", "ipAddress", "deviceName", "expiresAt", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${user.id}, ${hashRefreshToken(refreshToken)}, ${userAgent}, ${ipAddress}, ${deviceName}, ${expiresAt}, NOW(), NOW())
  `;
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address').max(254),
  password: z.string().min(12, 'Password must be at least 12 characters').max(256),
  name: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const sanitized = sanitizeAuthString(val, 80);
      return sanitized.length > 0 ? sanitized : undefined;
    }),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(256),
});

const accessCookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 1000,
};

function signAccessToken(user: { id: string; email: string }) {
  return jwt.sign({
    id: user.id,
    email: user.email,
    sub: user.id,
  }, env.JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'analytics-core-backend',
    audience: 'analytics-app',
  });
}

function signRefreshToken(user: { id: string; email: string }) {
  return jwt.sign({
    id: user.id,
    email: user.email,
    sub: user.id,
    type: 'refresh',
  }, env.JWT_SECRET, {
    expiresIn: '30d',
    issuer: 'analytics-core-backend',
    audience: 'analytics-app',
  });
}

function createCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((error) => error.message).join(', ');
      return res.status(400).json({ error: formatted });
    }

    const { email, password, name } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Registration failed. Please check your details or sign in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name || normalizedEmail.split('@')[0],
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email });

    await createServerSession(user, refreshToken, req as AuthenticatedRequest);

    const csrfToken = createCsrfToken();
    res.cookie('token', accessToken, accessCookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);
    res.cookie('csrf_token', csrfToken, csrfCookieOptions);
    return res.status(201).json({ user, csrfToken });
  } catch (error) {
    log('error', 'auth.register_failed', { requestId: (req as AuthenticatedRequest).requestId, error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(400).json({ error: 'Registration failed. Please check your information.' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((validationError) => validationError.message).join(', ');
      return res.status(400).json({ error: formatted });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid email or credentials' });
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email });

    await createServerSession(user, refreshToken, req as AuthenticatedRequest);

    const csrfToken = createCsrfToken();
    res.cookie('token', accessToken, accessCookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);
    res.cookie('csrf_token', csrfToken, csrfCookieOptions);
    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      csrfToken,
    });
  } catch (error) {
    log('error', 'auth.login_failed', { requestId: (req as AuthenticatedRequest).requestId, error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(400).json({ error: 'Login failed. Please check your credentials.' });
  }
});

router.post('/refresh', loginLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, env.JWT_SECRET, {
      issuer: 'analytics-core-backend',
      audience: 'analytics-app',
    }) as jwt.JwtPayload & { id: string; email: string; type?: string } | null;

    if (!decoded || typeof decoded !== 'object' || decoded.type !== 'refresh') {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await prisma.session.findUnique({ where: { refreshTokenHash } });
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    if (session.expiresAt <= new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (session.userId !== decoded.id) {
      return res.status(403).json({ error: 'Session user mismatch' });
    }

    // Atomically revoke this session. Only one refresh can claim a given token —
    // a second presenter will find the session already revoked.
    const revokedCount = await prisma.$executeRaw`
      UPDATE "Session"
      SET "revokedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${session.id}
        AND "revokedAt" IS NULL
    `;

    if (revokedCount === 0) {
      // The presented token was already rotated (its session is revoked).
      // That means it's either being replayed from a stolen copy, or it's a
      // stale token. Treat it as a compromised credential and kill every
      // session the user has.
      log('error', 'auth.refresh_reuse_detected', {
        requestId: (req as AuthenticatedRequest).requestId,
        userId: session.userId,
        sessionId: session.id,
      });
      await prisma.$executeRaw`
        UPDATE "Session"
        SET "revokedAt" = NOW(), "updatedAt" = NOW()
        WHERE "userId" = ${session.userId}
          AND "revokedAt" IS NULL
      `;
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true },
    });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate the refresh token: issue a fresh one and store its hash on a
    // new session row. The old token is now useless; replaying it triggers
    // the reuse detection above.
    const newRefreshToken = signRefreshToken({ id: dbUser.id, email: dbUser.email });
    await createServerSession(dbUser, newRefreshToken, req as AuthenticatedRequest);

    const accessToken = signAccessToken({ id: dbUser.id, email: dbUser.email });
    const csrfToken = createCsrfToken();

    res.cookie('token', accessToken, accessCookieOptions);
    res.cookie('refresh_token', newRefreshToken, refreshCookieOptions);
    res.cookie('csrf_token', csrfToken, csrfCookieOptions);

    return res.json({
      user: { id: dbUser.id, email: dbUser.email },
      csrfToken,
    });
  } catch (error) {
    log('warn', 'auth.refresh_failed', {
      requestId: (req as AuthenticatedRequest).requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', logoutLimiter, async (req: AuthenticatedRequest, res) => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;
  if (refreshToken) {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await prisma.$executeRaw`
      UPDATE "Session"
      SET "revokedAt" = NOW(), "updatedAt" = NOW()
      WHERE "refreshTokenHash" = ${refreshTokenHash}
        AND "revokedAt" IS NULL
    `;
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
  });
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
  });
  res.clearCookie('csrf_token', {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'lax',
  });
  return res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticateToken, meLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (error) {
    log('error', 'auth.me_failed', { requestId: req.requestId, userId: req.user?.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

export default router;
