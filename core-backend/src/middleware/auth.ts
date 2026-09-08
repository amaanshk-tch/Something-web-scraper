import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  requestId?: string;
}

interface TokenPayload extends JwtPayload {
  id: string;
  email: string;
  sub?: string;
  type?: string;
}

const tokenPayloadSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  sub: z.string().min(1),
  type: z.string().optional(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
}).passthrough();

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.split(' ')[1];
  const cookieToken = req.cookies?.token as string | undefined;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Access token required', requestId: req.requestId });
  }

  jwt.verify(token, env.JWT_SECRET, { issuer: 'analytics-core-backend', audience: 'analytics-app' }, (error, decoded) => {
    if (error || typeof decoded !== 'object' || !decoded) {
      return res.status(403).json({ error: 'Invalid or expired token', requestId: req.requestId });
    }

    const parsed = tokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      return res.status(403).json({ error: 'Invalid token payload', requestId: req.requestId });
    }

    const payload = parsed.data;
    if (payload.type === 'refresh') {
      return res.status(403).json({ error: 'Refresh token cannot be used as access token', requestId: req.requestId });
    }

    req.user = { id: payload.id, email: payload.email };
    next();
  });
};