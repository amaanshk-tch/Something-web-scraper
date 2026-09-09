const path = require('path');
const dotenv = require('dotenv');
const concurrently = require('concurrently');

const envFile = path.resolve(__dirname, '../.env');
const loaded = dotenv.config({ path: envFile });

if (loaded.error) {
  console.error(`[dev] FATAL: environment file not found at ${envFile}`);
  console.error('[dev] Copy .env.example to .env at the repository root.');
  process.exit(1);
}

concurrently(
[
      { name: 'DATA-ENGINE', command: 'python main.py', cwd: 'data-engine' },
      { name: 'PRES-SERVICE', command: 'python main.py', cwd: 'presentation-service' },
      { name: 'CORE-BACKEND', command: 'npm run dev', cwd: 'core-backend', env: { PORT: process.env.PORT } },
      { name: 'FRONTEND', command: 'npm run dev', cwd: 'frontend', env: { PORT: '3000' } },
    ],
  {
    prefix: '[{name}]',
    prefixColors: ['yellow.bold', 'magenta.bold', 'blue.bold', 'cyan.bold'],
    killOthers: ['failure', 'success'],
  }
).result.catch(() => {
  console.error('[dev] one or more services exited with an error.');
  process.exitCode = 1;
});