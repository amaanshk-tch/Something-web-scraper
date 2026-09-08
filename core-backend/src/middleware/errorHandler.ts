import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/appError';
import { log } from '../lib/logger';
import type { RequestContextRequest } from './requestContext';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const request = req as RequestContextRequest;

  if (error instanceof AppError) {
    log('error', 'request.app_error', {
      requestId: request.requestId,
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      details: error.details,
    });

    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: request.requestId,
        details: error.details,
      },
    });
  }

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
