'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { SearchForm } from '@/components/SearchForm';
import { JobStatusBar } from '@/components/JobStatusBar';
import { DataGrid } from '@/components/DataGrid';
import { DeckDownload } from '@/components/DeckDownload';
import { PieChart, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';
import type { JobCreateResponse, JobDetail, JobsPageResponse, JobSummary, SearchPayload } from '@/lib/types';

const BASE_POLL_INTERVAL_MS = 2500;
const SLOW_POLL_INTERVAL_MS = 5000;
const SLOW_POLL_AFTER_ATTEMPTS = 4;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetail | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);
  const [nextJobsCursor, setNextJobsCursor] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchRecentJobs = async (cursor?: string | null) => {
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
        const res = await apiClient.get<JobDetail>(`/jobs/${activeJobId}`);
        if (cancelled) return;

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
    try {
      const res = await apiClient.post<JobCreateResponse>('/jobs', payload);
      setActiveJobId(res.data.jobId);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'Failed to submit search job. Please check parameters.'));
      setSearching(false);
    }
  };

  const sentimentEntries = jobData?.sentimentData
    ? Object.entries(jobData.sentimentData).filter(
        (entry): entry is [string, number] => entry[0] !== '_meta' && typeof entry[1] === 'number'
      )
    : [];

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Research dashboard
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Search result snippets, keyword hits, and heuristic sentiment summaries.
        </p>
      </div>

      {submitError && (
        <div className="p-4 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{submitError}</span>
          </div>
          <button
            onClick={() => setSubmitError(null)}
            className="text-rose-400 hover:text-rose-200 p-1 rounded transition"
            aria-label="Close error notice"
          >
            <X className="w-4 h-4" />
          </button>
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
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            Note: Fewer live sources were discovered ({jobData.results.length}) than requested depth ({jobData.depth}). Returning verified live results only without synthetic padding.
          </span>
        </div>
      )}

      {jobData && jobData.status === 'COMPLETED' && (
        <DeckDownload jobId={jobData.id} topic={jobData.topic} />
      )}

      {jobData && jobData.status === 'COMPLETED' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-lg">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-400" />
              <span>Key findings</span>
            </h3>
            <div className="space-y-3">
              {jobData.bullets.length > 0 ? (
                jobData.bullets.map((bullet, index) => (
                  <div key={`${index}-${bullet}`} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{bullet}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">No takeaways available yet.</p>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg flex flex-col justify-between">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-400" />
              <span>Sentiment analysis</span>
            </h3>
            <div className="space-y-3">
              {sentimentEntries.map(([label, value]) => (
                <div key={label} className="bg-slate-950/60 p-3 rounded-md border border-slate-800/80 flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-300">{label}</span>
                  <span className="text-sm font-bold text-indigo-400 font-mono">{value} hits</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
              Based on lexical heuristics applied to retrieved titles and snippets.
            </div>
          </div>
        </div>
      )}

      {jobData && jobData.results && <DataGrid results={jobData.results} />}

      {recentJobs.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Previous analyses</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recentJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setActiveJobId(job.id)}
                className={`p-3.5 rounded-xl border text-left transition ${
                  activeJobId === job.id
                    ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="font-medium text-sm text-slate-200 truncate">{job.topic}</div>
                <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
                  <span className="uppercase text-[10px] font-semibold tracking-wider text-indigo-400">
                    {job.status}
                  </span>
                  <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
          {nextJobsCursor && (
            <button
              onClick={() => void fetchRecentJobs(nextJobsCursor)}
              className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 transition"
            >
              Load older jobs
            </button>
          )}
        </div>
      )}
    </div>
  );
}
