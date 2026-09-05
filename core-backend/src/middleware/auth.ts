import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
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
}

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

  jwt.verify(token, env.JWT_SECRET, (error, decoded) => {
    if (error || typeof decoded !== 'object' || !decoded) {
      return res.status(403).json({ error: 'Invalid or expired token', requestId: req.requestId });
    }

    const user = decoded as TokenPayload;
    req.user = { id: user.id, email: user.email };
    next();
  });
};