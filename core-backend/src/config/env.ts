/**
 * Centralized environment configuration with startup validation.
 *
 * This module is the ONLY place that reads from process.env. All other
 * modules must import from here — never access process.env directly.
 *
 * The application will terminate at startup if any required variable is
 * missing or does not meet minimum security requirements.
 */

function requireEnv(
  key: string,
  options?: number | { minLength?: number; requireDiversity?: boolean }
): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }

  const minLength = typeof options === 'number' ? options : options?.minLength;
  const requireDiversity = typeof options === 'object' ? options?.requireDiversity : false;

  if (minLength !== undefined && value.length < minLength) {
    console.error(
      `[FATAL] Environment variable ${key} must be at least ${minLength} characters long. ` +
        `Found ${value.length} characters. Use a strong, randomly generated value.`
    );
    process.exit(1);
  }

  if (requireDiversity) {
    const hasAlpha = /[a-zA-Z]/.test(value);
    const hasNumericOrSpecial = /[^a-zA-Z]/.test(value);
    if (!hasAlpha || !hasNumericOrSpecial) {
      console.error(
        `[FATAL] Environment variable ${key} lacks character diversity. ` +
          `It must contain a mix of letters and numbers/symbols. Generate a strong key (e.g. openssl rand -hex 32).`
      );
      process.exit(1);
    }
  }

  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

export const env = {
  // Server
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(optionalEnv('PORT', '4000'), 10),

  // Auth — required; minimum 32 characters to ensure adequate entropy
  JWT_SECRET: requireEnv('JWT_SECRET', { minLength: 32, requireDiversity: true }),

  // Internal service authentication — required
  INTERNAL_SERVICE_KEY: requireEnv('INTERNAL_SERVICE_KEY', { minLength: 20, requireDiversity: true }),

  // Downstream services
  DATA_ENGINE_URL: optionalEnv('DATA_ENGINE_URL', 'http://127.0.0.1:8001'),
  PRESENTATION_SERVICE_URL: optionalEnv('PRESENTATION_SERVICE_URL', 'http://127.0.0.1:8002'),

  // Rate-limit storage strategy.
  RATE_LIMIT_STORE: optionalEnv('RATE_LIMIT_STORE', 'memory'),
  REDIS_URL: optionalEnv('REDIS_URL', ''),

  // CORS
  ALLOWED_ORIGINS: optionalEnv(
    'ALLOWED_ORIGINS',
    optionalEnv('FRONTEND_URL', 'http://localhost:3000')
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Convenience flag
  get isProduction() {
    return this.NODE_ENV === 'production';
  },
} as const;

if (env.NODE_ENV === 'production' && env.RATE_LIMIT_STORE === 'redis' && !env.REDIS_URL) {
  console.error('[FATAL] RATE_LIMIT_STORE=redis requires REDIS_URL in production.');
  process.exit(1);
}
