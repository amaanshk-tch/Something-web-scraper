'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/lib/toastContext';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { useJobPolling, useRecentJobs } from '@/lib/hooks';
import { SearchForm } from '@/components/SearchForm';
import { JobStatusBar } from '@/components/JobStatusBar';
import { DataGrid } from '@/components/DataGrid';
import { DeckDownload } from '@/components/DeckDownload';
import { BarChart3, CheckCircle, AlertCircle, X, RotateCcw } from 'lucide-react';
import { DEMO_MODE } from '@/lib/demoMode';
import { createDemoJob } from '@/lib/demoApi';
import type { JobCreateResponse, SearchPayload } from '@/lib/types';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Track previous status to notify only on state transitions
  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const { recentJobs, nextJobsCursor, fetchMoreJobs, refetchJobs } = useRecentJobs(user, activeJobId, (jobId) => {
    setActiveJobId(jobId);
  });

  const jobData = useJobPolling(activeJobId, refetchJobs, (status, jobDetail) => {
    if (previousStatusRef.current !== status) {
      if (status === 'COMPLETED') {
        toast.success(
          'Analysis complete',
          `Discovered ${jobDetail?.results?.length ?? 0} sources with keyword signals.`
        );
      } else if (status === 'FAILED') {
        toast.error(
          'Analysis failed',
          jobDetail?.errorMessage || 'Data extraction encountered an error. Please retry.'
        );
      }
      previousStatusRef.current = status;
    }

    if (status === 'COMPLETED' || status === 'FAILED') {
      setSearching(false);
    }
  });

  const handleStartSearch = async (payload: SearchPayload) => {
    setSearching(true);
    setSubmitError(null);
    previousStatusRef.current = 'QUEUED';

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

  const lexicalSignalEntries = jobData?.sentimentData
    ? Object.entries(jobData.sentimentData).filter(
        (entry): entry is [string, number] => entry[0] !== '_meta' && typeof entry[1] === 'number'
      )
    : [];

  const sourceCoverage = jobData
    ? `${jobData.results.length} of ${jobData.depth} requested`
    : '0 of 0 requested';

  if (authLoading || !user) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-[#74766f]">Loading workspace…</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col justify-between gap-5 border-b border-[#d9d5cb] pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Source review workspace</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em] sm:text-5xl">Signal review desk</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#74766f]">Collect source snippets, inspect keyword hits, and package the signal evidence into a report.</p>
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
        <section className="panel p-6">
          <div className="overflow-hidden rounded-xl border border-[#d9d5cb] bg-[#fbf9f4]">
            <div className="border-b border-[#d9d5cb] px-5 py-4">
              <p className="eyebrow">Research question</p>
              <div className="mt-3 rounded-lg border border-[#e1ddd4] bg-white px-5 py-5 font-serif text-2xl leading-tight text-[#20221d]">
                {jobData.topic}
              </div>
            </div>

            <div className="grid gap-2 border-b border-[#d9d5cb] px-5 py-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#e1ddd4] bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b887f]">Sources</div>
                <div className="mt-2 font-serif text-3xl text-[#20221d]">{jobData.results.length}</div>
              </div>
              <div className="rounded-lg border border-[#e1ddd4] bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b887f]">Sources found</div>
                <div className="mt-2 font-serif text-2xl leading-tight text-[#20221d]">{sourceCoverage}</div>
              </div>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr]">
              <section className="rounded-lg border border-[#e1ddd4] bg-white p-5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#2e6b3e]" />
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#8b887f]">Executive summary</span>
                </div>
                <div className="mt-4 space-y-3">
                  {jobData.bullets.length ? (
                    jobData.bullets.slice(0, 4).map((bullet, index) => (
                      <div key={`${index}-${bullet}`} className="flex gap-2 text-sm leading-6 text-[#4e5049]">
                        <span className="font-mono text-[#aaa69d]">•</span>
                        <span>{bullet}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-[#74766f]">No executive findings yet.</span>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-[#e1ddd4] bg-white p-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#707154]" />
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#8b887f]">Keyword signal map</span>
                </div>
                <div className="mt-4 space-y-3">
                  {lexicalSignalEntries.length ? (
                    lexicalSignalEntries.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between border-b border-[#ece8e0] py-2">
                        <span className="text-sm text-[#5f615a]">{label}</span>
                        <span className="font-mono text-sm font-semibold">{value}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-[#74766f]">Keyword signal map unavailable.</span>
                  )}
                </div>
              </section>
            </div>

            <div className="border-t border-[#d9d5cb] px-5 py-5">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#2e6b3e]" />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[#8b887f]">Evidence</span>
              </div>
              <div className="mt-4 rounded-lg border border-[#e1ddd4] bg-white px-4 py-4">
                <div className="space-y-2">
                  {jobData.results.slice(0, 3).map((result, index) => (
                    <div key={result.id} className="grid gap-2 border-b border-[#ece8e0] pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold text-sm text-[#20221d]">Claim {index + 1}</span>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[#8b887f]">supports</span>
                      </div>
                      <div className="text-sm text-[#74766f]">
                        <span className="inline-block rounded-full border border-[#d9d5cb] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#5f615a]">{result.title}</span>
                      </div>
                      <div className="text-sm leading-6 text-[#4e5049]">{result.snippet}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
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
                onClick={() => void fetchMoreJobs(nextJobsCursor)}
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
