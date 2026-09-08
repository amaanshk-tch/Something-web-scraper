import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function parseOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return undefined;
  }
}

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalized = parseOrigin(origin);
  if (!normalized) return false;
  return env.ALLOWED_ORIGINS.includes(normalized);
}

function compareToken(expected: string, received: string): boolean {
  try {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(received, 'utf8');
    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export function enforceOriginOnly(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const normalizedOrigin = parseOrigin(typeof origin === 'string' ? origin : undefined);
  if (!originAllowed(normalizedOrigin)) {
    return res.status(403).json({ error: 'Origin not allowed by origin validation.' });
  }

  return next();
}

export function enforceOriginAndCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const normalizedOrigin = parseOrigin(typeof origin === 'string' ? origin : undefined);
  if (!originAllowed(normalizedOrigin)) {
    return res.status(403).json({ error: 'Origin not allowed by origin validation.' });
  }

  const csrfCookie = req.cookies?.csrf_token as string | undefined;
  const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
  if (!csrfCookie || !csrfHeader || !compareToken(csrfCookie, csrfHeader)) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }

  return next();
}
