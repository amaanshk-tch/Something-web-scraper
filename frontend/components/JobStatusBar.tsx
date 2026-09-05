'use client';

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface JobStatusBarProps {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  topic: string;
}

export const JobStatusBar = ({ status, errorMessage, topic }: JobStatusBarProps) => {
  const statusCopy = {
    PENDING: 'Queued',
    PROCESSING: 'Processing',
    COMPLETED: 'Complete',
    FAILED: 'Failed',
  }[status];

  return (
    <section className="bg-slate-900 border border-slate-800 px-5 py-4 rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {status === 'PROCESSING' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
          {status === 'COMPLETED' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {status === 'PENDING' && <Clock className="w-5 h-5 text-amber-400 animate-pulse" />}
          {status === 'FAILED' && <AlertCircle className="w-5 h-5 text-rose-400" />}
          <span className="font-semibold text-sm text-slate-200">{statusCopy}</span>
          <span className="text-xs text-slate-500">Topic: &quot;{topic}&quot;</span>
        </div>
        {status === 'PROCESSING' && (
          <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
            Retrieving sources and analyzing snippets...
          </span>
        )}
      </div>
      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-md mt-4">
          {errorMessage}
        </div>
      )}
    </section>
  );
};