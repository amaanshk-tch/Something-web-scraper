import type { ErrorRequestHandler } from 'express';
import { log } from '../lib/logger';
import type { RequestContextRequest } from './requestContext';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const request = req as RequestContextRequest;

  log('error', 'request.unhandled_error', {
    requestId: request.requestId,
    message: error instanceof Error ? error.message : String(error),
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
      requestId: request.requestId,
    },
  });
};
