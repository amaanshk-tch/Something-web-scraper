'use client';
import React from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';

export const JobStatusBar = ({ status, errorMessage, topic }: { status: 'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'; errorMessage?: string; topic: string }) => {
  const config = {
    PENDING: ['Queued', Clock3], PROCESSING: ['Reviewing sources', Loader2], COMPLETED: ['Complete', CheckCircle2], FAILED: ['Failed', AlertCircle],
  } as const;
  const [label, Icon] = config[status];
  return <section className="flex items-center justify-between gap-4 border-y border-[#d9d5cb] py-4"><div className="flex min-w-0 items-center gap-3"><Icon className={`h-4 w-4 shrink-0 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} /><span className="text-sm font-semibold">{label}</span><span className="truncate text-sm text-[#74766f]">{topic}</span></div>{errorMessage && <span className="text-xs text-[#8a3f36]">{errorMessage}</span>}</section>;
};
