import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { log } from '../lib/logger';

export interface RequestContextRequest extends Request {
  requestId: string;
  requestStartedAt: number;
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const suppliedId = req.header('x-request-id');
  const requestId = suppliedId && /^[a-zA-Z0-9-]{8,128}$/.test(suppliedId) ? suppliedId : randomUUID();
  const contextualRequest = req as RequestContextRequest;

  contextualRequest.requestId = requestId;
  contextualRequest.requestStartedAt = Date.now();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    log('info', 'http.request.completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - contextualRequest.requestStartedAt,
    });
  });

  next();
}