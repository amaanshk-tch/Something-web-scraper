'use client';

import React, { useState } from 'react';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { Presentation, Download, Loader2 } from 'lucide-react';

interface DeckDownloadProps {
  jobId: string;
  topic: string;
}

export const DeckDownload = ({ jobId, topic }: DeckDownloadProps) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/jobs/${jobId}/presentation`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Research_Report_${topic.replace(/\s+/g, '_')}.pptx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('Download error:', downloadError);
      setError(getApiErrorMessage(downloadError, 'Could not create the report. Please try again.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="bg-slate-900 border border-slate-800 p-5 rounded-lg">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-md bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Presentation className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-base">Report ready</h4>
            <p className="text-xs text-slate-400 mt-0.5">Download a PowerPoint report with source snippets and heuristic sentiment counts.</p>
          </div>
        </div>
        <button onClick={() => void handleDownload()} disabled={downloading} className="w-full md:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-md flex items-center justify-center gap-2 transition text-sm whitespace-nowrap">
          {downloading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Creating report...</span></> : <><Download className="w-4 h-4" /><span>Download report</span></>}
        </button>
      </div>
      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <span>{error}</span>
          <button onClick={() => void handleDownload()} className="shrink-0 font-medium text-rose-100 underline underline-offset-2">Try again</button>
        </div>
      )}
    </section>
  );
};