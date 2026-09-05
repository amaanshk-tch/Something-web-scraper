# Apex Intelligence - Web Analysis and Presentation Reports

A full-stack web application that queues analysis jobs, retrieves live search-result snippets, applies simple lexical sentiment heuristics, and generates PowerPoint (`.pptx`) summary decks.

## What it does

- Accepts a topic, optional keyword list, and a requested result depth.
- Enqueues the job in PostgreSQL and processes it through a background worker.
- Fetches DuckDuckGo HTML result cards and extracts titles, URLs, and snippets.
- Counts keyword hits in titles and snippets and classifies sentiment with a heuristic keyword matcher.
- Stores results in PostgreSQL and lets the user download a generated deck.

## Current architecture

- `frontend/`: Next.js dashboard for auth, job submission, polling, result browsing, and deck download.
- `core-backend/`: Express + Prisma API v1 with cookie auth, CORS allowlist, queue-style job processing, pagination, rate limiting, correlation IDs, and graceful shutdown.
- `data-engine/`: FastAPI service that extracts search-result cards and computes heuristic sentiment summaries.
- `presentation-service/`: FastAPI service that generates PPTX files and cleans temporary output files.

## Current limitations

- Sentiment is lexical and does not understand negation, context, or document-level meaning.
- The worker analyzes search-result snippets, not full fetched documents.
- Job status updates currently use adaptive polling from the frontend rather than SSE or WebSockets.
- The shared API contract is currently a TypeScript contract module, not a generated client.

## Reliability and safety controls

- Browser access is restricted to configured CORS origins.
- Internal service calls require `X-Internal-Key`.
- Auth uses HttpOnly cookies.
- Request bodies and key inputs have size limits.
- Job submission and auth routes have dedicated rate limits.
- Presentation files are deleted after transfer and old temp files are swept on startup.

## Data model improvements in place

- `Job` has indexes for `userId + createdAt` and `status + createdAt`.
- `Result` has an index for `jobId + mentions`.
- `GET /jobs` now supports cursor pagination.

## Database migrations

- Local development: `cd core-backend && npx prisma migrate dev`.
- Production deployment: `cd core-backend && npx prisma migrate deploy`.
- `prisma db push` is useful for disposable prototypes, not production schema rollout.

## Database migrations

- Local development: `cd core-backend && npx prisma migrate dev`.
- Production deployment: `cd core-backend && npx prisma migrate deploy`.
- `prisma db push` is useful for disposable prototypes, not production schema rollout.

The root `package.json` is intentionally a lightweight local-process launcher. Each deployable service owns its own dependencies and lockfile.

## Local run

1. Configure the root `.env` with `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SERVICE_KEY`, and `FRONTEND_URL`/`ALLOWED_ORIGINS`.
2. Run `cd core-backend && npx prisma migrate dev` to apply local migrations.
3. Install Python dependencies in `data-engine/` and `presentation-service/`.
4. Run `npm run dev` from the workspace root.
