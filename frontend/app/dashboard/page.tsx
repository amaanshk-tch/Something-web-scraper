'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/lib/toastContext';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { SearchForm } from '@/components/SearchForm';
import { JobStatusBar } from '@/components/JobStatusBar';
import { DataGrid } from '@/components/DataGrid';
import { DeckDownload } from '@/components/DeckDownload';
import { BarChart3, CheckCircle, AlertCircle, X, RotateCcw } from 'lucide-react';
import { DEMO_MODE } from '@/lib/demoMode';
import { createDemoJob, getDemoJob, listDemoJobs } from '@/lib/demoApi';
import type { JobCreateResponse, JobDetail, JobsPageResponse, JobSummary, SearchPayload } from '@/lib/types';

const BASE_POLL_INTERVAL_MS = 2500;
const SLOW_POLL_INTERVAL_MS = 5000;
const SLOW_POLL_AFTER_ATTEMPTS = 4;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetail | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);
  const [nextJobsCursor, setNextJobsCursor] = useState<string | null>(null);

  // Track previous status to notify only on state transitions
  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchRecentJobs = async (cursor?: string | null) => {
    if (DEMO_MODE) {
      const jobs = listDemoJobs();
      setRecentJobs(cursor ? (prev) => [...prev, ...jobs] : jobs);
      setNextJobsCursor(null);
      if (jobs.length > 0 && !activeJobId && !cursor) setActiveJobId(jobs[0].id);
      return;
    }
    try {
      const params = cursor ? { cursor, limit: 12 } : { limit: 12 };
      const res = await apiClient.get<JobsPageResponse>('/jobs', { params });
      setRecentJobs((prev) => (cursor ? [...prev, ...res.data.jobs] : res.data.jobs));
      setNextJobsCursor(res.data.nextCursor);
      if (res.data.jobs.length > 0 && !activeJobId && !cursor) {
        setActiveJobId(res.data.jobs[0].id);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('History unavailable', 'Could not retrieve previous analyses.');
    }
  };

  useEffect(() => {
    if (user) {
      void fetchRecentJobs();
    }
  }, [user]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;
    let attemptCount = 0;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const pollJob = async () => {
      try {
        if (DEMO_MODE) {
          const demoJob = getDemoJob(activeJobId);
          if (!demoJob) return;

          // Check if transitioning to completed or failed
          if (previousStatusRef.current !== demoJob.status) {
            if (demoJob.status === 'COMPLETED') {
              toast.success(
                'Analysis complete',
                `Found ${demoJob.results.length} sources and compiled key takeaways.`
              );
            } else if (demoJob.status === 'FAILED') {
              toast.error('Analysis failed', demoJob.errorMessage || 'Data extraction encountered an error.');
            }
            previousStatusRef.current = demoJob.status;
          }

          setJobData({ ...demoJob });
          if (demoJob.status === 'COMPLETED' || demoJob.status === 'FAILED') {
            setSearching(false);
            void fetchRecentJobs();
            return;
          }
          timeoutHandle = setTimeout(() => void pollJob(), BASE_POLL_INTERVAL_MS);
          return;
        }

        const res = await apiClient.get<JobDetail>(`/jobs/${activeJobId}`);
        if (cancelled) return;

        // Check if transitioning to completed or failed
        if (previousStatusRef.current !== res.data.status) {
          if (res.data.status === 'COMPLETED') {
            toast.success(
              'Analysis complete',
              `Discovered ${res.data.results?.length ?? 0} sources with sentiment signals.`
            );
          } else if (res.data.status === 'FAILED') {
            toast.error(
              'Analysis failed',
              res.data.errorMessage || 'Data extraction encountered an error. Please retry.'
            );
          }
          previousStatusRef.current = res.data.status;
        }

        setJobData(res.data);

        if (res.data.status === 'COMPLETED' || res.data.status === 'FAILED') {
          setSearching(false);
          void fetchRecentJobs();
          return;
        }

        attemptCount += 1;
        const nextDelay = attemptCount >= SLOW_POLL_AFTER_ATTEMPTS ? SLOW_POLL_INTERVAL_MS : BASE_POLL_INTERVAL_MS;
        timeoutHandle = setTimeout(() => {
          void pollJob();
        }, nextDelay);
      } catch (error) {
        if (cancelled) return;
        console.error('Polling error:', error);
        timeoutHandle = setTimeout(() => {
          void pollJob();
        }, SLOW_POLL_INTERVAL_MS);
      }
    };

    void pollJob();

    return () => {
      cancelled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [activeJobId]);

  const handleStartSearch = async (payload: SearchPayload) => {
    setSearching(true);
    setSubmitError(null);
    previousStatusRef.current = 'PENDING';

    try {
      if (DEMO_MODE) {
        const demoId = createDemoJob(payload);
        setActiveJobId(demoId);
        toast.success('Analysis initiated', `Reviewing sources for "${payload.topic}"…`);
        return;
      }

      const res = await apiClient.post<JobCreateResponse>('/jobs', payload);
      setActiveJobId(res.data.jobId);
      toast.success('Analysis initiated', `Reviewing sources for "${payload.topic}"…`);
    } catch (error) {
      const errorMsg = getApiErrorMessage(error, 'Failed to submit search job. Please check parameters.');
      setSubmitError(errorMsg);
      toast.error('Submission failed', errorMsg);
      setSearching(false);
    }
  };

  const sentimentEntries = jobData?.sentimentData
    ? Object.entries(jobData.sentimentData).filter(
        (entry): entry is [string, number] => entry[0] !== '_meta' && typeof entry[1] === 'number'
      )
    : [];

  if (authLoading || !user) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-[#74766f]">Loading workspace…</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col justify-between gap-5 border-b border-[#d9d5cb] pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Research workspace</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em] sm:text-5xl">Analysis desk</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#74766f]">Collect source evidence, inspect the signals, then package the useful parts into a report.</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase tracking-[0.12em] text-[#99958b]">Signed in as</p>
          <p className="mt-1 text-sm font-semibold">{user.name || user.email}</p>
        </div>
      </div>

      {DEMO_MODE && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-[#c9c4b9] bg-[#eeeae2]/60 px-4 py-3 text-xs text-[#74766f]">
          <span>
            <strong className="text-[#36382f]">Review mode.</strong> Authentication and database calls are replaced with local demo data.
          </span>
          <span className="hidden sm:inline">Safe to remove before production</span>
        </div>
      )}

      {/* Submission Error Banner */}
      {submitError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#d9b9b3] bg-[#fbf1ef] p-4 text-sm text-[#8a3f36] animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#9c362d]" />
            <span>{submitError}</span>
          </div>
          <button
            onClick={() => setSubmitError(null)}
            aria-label="Dismiss error"
            className="text-[#8a3f36]/70 hover:text-[#8a3f36]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Job Failure Banner */}
      {jobData && jobData.status === 'FAILED' && (
        <div className="rounded-xl border border-[#e2bcba] bg-[#fcf3f2] p-5 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f7e4e3]">
                <AlertCircle className="h-5 w-5 text-[#9c362d]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#1f211d]">Analysis Could Not Be Completed</h3>
                <p className="mt-1 text-sm text-[#74766f]">
                  {jobData.errorMessage || 'An error occurred while scraping web sources for this topic.'}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                handleStartSearch({
                  topic: jobData.topic,
                  keywords: jobData.keywords,
                  depth: jobData.depth,
                })
              }
              className="quiet-button inline-flex items-center gap-1.5 shrink-0 text-xs font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry Analysis
            </button>
          </div>
        </div>
      )}

      <SearchForm onSearch={handleStartSearch} loading={searching} />

      {jobData && (
        <JobStatusBar
          status={jobData.status}
          errorMessage={jobData.errorMessage ?? undefined}
          topic={jobData.topic}
        />
      )}

      {jobData && jobData.liveResultsOnly && jobData.status === 'COMPLETED' && (
        <div className="rounded-lg border border-[#ddd3b7] bg-[#faf7ea] px-4 py-3 text-sm leading-6 text-[#70633b]">
          Fewer live sources were discovered ({jobData.results.length}) than requested depth ({jobData.depth}). Verified results are shown without synthetic padding.
        </div>
      )}

      {jobData && jobData.status === 'COMPLETED' && (
        <DeckDownload jobId={jobData.id} topic={jobData.topic} />
      )}

      {jobData && jobData.status === 'COMPLETED' && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_.7fr]">
          <section className="panel p-6">
            <div className="flex items-center gap-3 border-b border-[#e1ddd4] pb-4">
              <CheckCircle className="h-4 w-4 text-[#2e6b3e]" />
              <div>
                <p className="eyebrow">Interpretation</p>
                <h3 className="mt-1 font-serif text-2xl">Key findings</h3>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {jobData.bullets.length ? (
                jobData.bullets.map((bullet, index) => (
                  <div
                    key={`${index}-${bullet}`}
                    className="grid grid-cols-[24px_1fr] gap-3 border-b border-[#ece8e0] pb-4 last:border-0 last:pb-0"
                  >
                    <span className="font-mono text-xs text-[#aaa69d]">0{index + 1}</span>
                    <p className="text-sm leading-6 text-[#4e5049]">{bullet}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#74766f]">No takeaways available yet.</p>
              )}
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex items-center gap-3 border-b border-[#e1ddd4] pb-4">
              <BarChart3 className="h-4 w-4" />
              <div>
                <p className="eyebrow">Signals</p>
                <h3 className="mt-1 font-serif text-2xl">Sentiment</h3>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {sentimentEntries.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-[#ece8e0] py-2.5"
                >
                  <span className="text-sm text-[#5f615a]">{label}</span>
                  <span className="font-mono text-sm font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-5 text-[#99958b]">
              Lexical heuristic applied to retrieved titles and snippets.
            </p>
          </section>
        </div>
      )}

      {jobData?.results && <DataGrid results={jobData.results} />}

      {recentJobs.length > 0 && (
        <section className="panel p-6">
          <div className="flex items-end justify-between border-b border-[#e1ddd4] pb-4">
            <div>
              <p className="eyebrow">History</p>
              <h3 className="mt-1 font-serif text-2xl">Previous analyses</h3>
            </div>
            {nextJobsCursor && (
              <button
                onClick={() => void fetchRecentJobs(nextJobsCursor)}
                className="text-xs font-semibold underline underline-offset-4"
              >
                Load older
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {recentJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => {
                  setActiveJobId(job.id);
                  previousStatusRef.current = job.status;
                }}
                className={`rounded-lg border p-4 text-left transition ${
                  activeJobId === job.id
                    ? 'border-[#85867c] bg-[#f0ede6]'
                    : 'border-[#e1ddd4] hover:bg-[#faf8f3]'
                }`}
              >
                <div className="truncate text-sm font-semibold">{job.topic}</div>
                <div className="mt-2 flex justify-between text-[11px] uppercase tracking-[0.08em] text-[#8b887f]">
                  <span>{job.status}</span>
                  <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
