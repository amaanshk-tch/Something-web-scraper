'use client';
import React from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';

export const JobStatusBar = ({ status, errorMessage, topic }: { status: 'QUEUED'|'PLANNING'|'SEARCHING'|'FETCHING'|'ANALYZING'|'SYNTHESIZING'|'GENERATING_REPORT'|'COMPLETED'|'FAILED'|'CANCELLED'; errorMessage?: string; topic: string }) => {
  const config = {
    QUEUED: ['Queued', Clock3],
    PLANNING: ['Planning', Loader2],
    SEARCHING: ['Searching', Loader2],
    FETCHING: ['Fetching sources', Loader2],
    ANALYZING: ['Analyzing claims', Loader2],
    SYNTHESIZING: ['Synthesizing evidence', Loader2],
    GENERATING_REPORT: ['Generating report', Loader2],
    COMPLETED: ['Complete', CheckCircle2],
    FAILED: ['Failed', AlertCircle],
    CANCELLED: ['Cancelled', AlertCircle],
  } as const;
  const [label, Icon] = config[status] ?? config.QUEUED;
  return <section className="flex items-center justify-between gap-4 border-y border-[#d9d5cb] py-4"><div className="flex min-w-0 items-center gap-3"><Icon className={`h-4 w-4 shrink-0 ${status !== 'COMPLETED' && status !== 'FAILED' && status !== 'CANCELLED' ? 'animate-spin' : ''}`} /><span className="text-sm font-semibold">{label}</span><span className="truncate text-sm text-[#74766f]">{topic}</span></div>{errorMessage && <span className="text-xs text-[#8a3f36]">{errorMessage}</span>}</section>;
};
