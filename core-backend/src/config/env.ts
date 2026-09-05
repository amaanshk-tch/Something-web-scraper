/**
 * Centralized environment configuration with startup validation.
 *
 * This module is the ONLY place that reads from process.env. All other
 * modules must import from here — never access process.env directly.
 *
 * The application will terminate at startup if any required variable is
 * missing or does not meet minimum security requirements.
 */

function requireEnv(key: string, minLength?: number): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
  if (minLength !== undefined && value.length < minLength) {
    console.error(
      `[FATAL] Environment variable ${key} must be at least ${minLength} characters long. ` +
        `Found ${value.length} characters. Use a strong, randomly generated value.`
    );
    process.exit(1);
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
  JWT_SECRET: requireEnv('JWT_SECRET', 32),

  // Internal service authentication — required
  INTERNAL_SERVICE_KEY: requireEnv('INTERNAL_SERVICE_KEY', 20),

  // Downstream services
  DATA_ENGINE_URL: optionalEnv('DATA_ENGINE_URL', 'http://127.0.0.1:8001'),
  PRESENTATION_SERVICE_URL: optionalEnv('PRESENTATION_SERVICE_URL', 'http://127.0.0.1:8002'),

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
