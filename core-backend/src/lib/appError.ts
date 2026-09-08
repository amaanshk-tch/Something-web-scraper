export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ERROR_CODES = {
  DATA_ENGINE_TIMEOUT: 'DATA_ENGINE_TIMEOUT',
  SEARCH_PROVIDER_FAILED: 'SEARCH_PROVIDER_FAILED',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  REPORT_GENERATION_FAILED: 'REPORT_GENERATION_FAILED',
  INVALID_RESEARCH_REQUEST: 'INVALID_RESEARCH_REQUEST',
} as const;
