-- Persist the originating API request identifier for queued-job correlation.
ALTER TABLE "Job" ADD COLUMN "requestId" TEXT;

CREATE INDEX "Job_requestId_idx" ON "Job"("requestId");