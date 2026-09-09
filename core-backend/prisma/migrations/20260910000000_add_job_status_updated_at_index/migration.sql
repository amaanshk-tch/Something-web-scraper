-- Cover the stale-job reconciliation scan: WHERE status IN (...) AND updatedAt < cutoff.
CREATE INDEX "Job_status_updatedAt_idx" ON "Job"("status", "updatedAt");