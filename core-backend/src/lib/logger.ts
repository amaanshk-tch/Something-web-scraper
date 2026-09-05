type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'core-backend',
    level,
    event,
    ...fields,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}