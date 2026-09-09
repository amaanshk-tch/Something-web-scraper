'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { getDemoJob, listDemoJobs } from '@/lib/demoApi';
import { DEMO_MODE } from '@/lib/demoMode';
import type { JobDetail, JobsPageResponse, JobSummary } from '@/lib/types';

const BASE_POLL_INTERVAL_MS = 2500;
const SLOW_POLL_INTERVAL_MS = 5000;
const SLOW_POLL_AFTER_ATTEMPTS = 4;

const TERMINAL_JOB_STATUSES = new Set(['COMPLETED', 'FAILED']);

export function useJobPolling(
  activeJobId: string | null,
  refetchJobs: () => void,
  onStatusChange: (status: string, jobDetail: JobDetail | null) => void,
) {
  const [jobData, setJobData] = useState<JobDetail | null>(null);
  const activeJobIdRef = useRef(activeJobId);
  activeJobIdRef.current = activeJobId;
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });
  const refetchJobsRef = useRef(refetchJobs);
  useEffect(() => {
    refetchJobsRef.current = refetchJobs;
  });
  const attemptCountsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setJobData(null);
  }, [activeJobId]);

  useEffect(() => {
    if (!DEMO_MODE) return;
    if (!activeJobId) return;

    let cancelled = false;
    let handle: ReturnType<typeof setTimeout> | null = null;
    let attemptCount = 0;

    const poll = () => {
      const demoJob = getDemoJob(activeJobId);
      if (!demoJob || cancelled) return;

      setJobData({ ...demoJob });
      onStatusChangeRef.current(demoJob.status, demoJob);

      if (TERMINAL_JOB_STATUSES.has(demoJob.status)) {
        refetchJobsRef.current();
        return;
      }

      attemptCount += 1;
      handle = setTimeout(
        poll,
        attemptCount >= SLOW_POLL_AFTER_ATTEMPTS ? SLOW_POLL_INTERVAL_MS : BASE_POLL_INTERVAL_MS
      );
    };

    poll();

    return () => {
      cancelled = true;
      if (handle) clearTimeout(handle);
    };
  }, [activeJobId]);

  const { data: queryData } = useQuery<JobDetail>({
    queryKey: ['job', activeJobId],
    queryFn: async () => {
      const currentJobId = activeJobIdRef.current;
      if (!currentJobId) throw new Error('No active job');
      const count = (attemptCountsRef.current.get(currentJobId) ?? 0) + 1;
      attemptCountsRef.current.set(currentJobId, count);
      const res = await apiClient.get<JobDetail>(`/jobs/${currentJobId}`);
      return res.data;
    },
    enabled: !DEMO_MODE && !!activeJobId,
    staleTime: 0,
    refetchInterval: (query) => {
      const currentJobId = activeJobIdRef.current;
      if (!currentJobId) return false;
      const data = query.state.data;
      if (data && TERMINAL_JOB_STATUSES.has(data.status)) return false;
      const attempts = attemptCountsRef.current.get(currentJobId) ?? 0;
      return attempts >= SLOW_POLL_AFTER_ATTEMPTS ? SLOW_POLL_INTERVAL_MS : BASE_POLL_INTERVAL_MS;
    },
  });

  useEffect(() => {
    if (DEMO_MODE) return;
    if (!queryData) return;
    if (queryData.id !== activeJobIdRef.current) return;

    setJobData(queryData);
    onStatusChangeRef.current(queryData.status, queryData);

    if (TERMINAL_JOB_STATUSES.has(queryData.status)) {
      refetchJobsRef.current();
    }
  }, [queryData]);

  return jobData;
}

export function useRecentJobs(
  user: unknown,
  activeJobId: string | null,
  onAutoSelect: (jobId: string) => void,
) {
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);
  const [nextJobsCursor, setNextJobsCursor] = useState<string | null>(null);
  const autoSelectedRef = useRef(false);
  const fetchMoreInflightRef = useRef(false);
  const activeJobIdRef = useRef(activeJobId);
  activeJobIdRef.current = activeJobId;
  const onAutoSelectRef = useRef(onAutoSelect);
  useEffect(() => {
    onAutoSelectRef.current = onAutoSelect;
  });

  const { data: apiJobs, refetch: refetchQuery } = useQuery<JobsPageResponse>({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await apiClient.get<JobsPageResponse>('/jobs', { params: { limit: 12 } });
      return res.data;
    },
    enabled: !DEMO_MODE && !!user,
  });

  useEffect(() => {
    if (DEMO_MODE) return;
    if (!apiJobs) return;

    setRecentJobs(apiJobs.jobs);
    setNextJobsCursor(apiJobs.nextCursor);
    if (!autoSelectedRef.current && !activeJobIdRef.current && apiJobs.jobs.length > 0) {
      autoSelectedRef.current = true;
      onAutoSelectRef.current(apiJobs.jobs[0].id);
    }
  }, [apiJobs]);

  useEffect(() => {
    if (!DEMO_MODE || !user) return;

    const jobs = listDemoJobs();
    setRecentJobs(jobs);
    setNextJobsCursor(null);
    if (!autoSelectedRef.current && !activeJobIdRef.current && jobs.length > 0) {
      autoSelectedRef.current = true;
      onAutoSelectRef.current(jobs[0].id);
    }
  }, [user]);

  const fetchMoreJobs = async (cursor: string) => {
    if (DEMO_MODE) return;
    if (fetchMoreInflightRef.current) return;
    fetchMoreInflightRef.current = true;

    try {
      const res = await apiClient.get<JobsPageResponse>('/jobs', { params: { cursor, limit: 12 } });
      setRecentJobs((prev) => [...prev, ...res.data.jobs]);
      setNextJobsCursor(res.data.nextCursor);
    } catch {
      // Error handled by caller if needed
    } finally {
      fetchMoreInflightRef.current = false;
    }
  };

  const refetchJobs = () => {
    if (DEMO_MODE) {
      const jobs = listDemoJobs();
      setRecentJobs(jobs);
      setNextJobsCursor(null);
    } else {
      void refetchQuery();
    }
  };

  return { recentJobs, nextJobsCursor, fetchMoreJobs, refetchJobs };
}