'use client';
import React, { useState } from 'react';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { DEMO_MODE } from '@/lib/demoMode';
import { ArrowDownToLine, FileText, Loader2 } from 'lucide-react';

export const DeckDownload = ({ jobId, topic }: { jobId: string; topic: string }) => {
  const [downloading, setDownloading] = useState(false); const [error, setError] = useState<string | null>(null);
  const handleDownload = async () => {
    setDownloading(true); setError(null);
    try {
      if (DEMO_MODE) {
        const blob = new Blob([JSON.stringify({ demo: true, jobId, topic, note: 'Demo report placeholder. Connect the presentation service for a real PowerPoint export.' }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `Research_Report_${topic.replace(/\s+/g, '_')}.json`; link.click(); URL.revokeObjectURL(url); return;
      }
      const response = await apiClient.get(`/jobs/${jobId}/presentation`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data])); const link = document.createElement('a'); link.href = url; link.download = `Research_Report_${topic.replace(/\s+/g, '_')}.pptx`; document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (e) { setError(getApiErrorMessage(e, 'Could not create the report. Please try again.')); } finally { setDownloading(false); }
  };
  return <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#cfcac0]"><FileText className="h-4 w-4" /></div><div><p className="font-serif text-lg">Report ready</p><p className="mt-0.5 text-xs text-[#74766f]">{DEMO_MODE ? 'Demo export is a review placeholder.' : 'Generate the PowerPoint report.'}</p></div></div><button onClick={() => void handleDownload()} disabled={downloading} className="primary-button inline-flex items-center justify-center gap-2 disabled:opacity-40">{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}{DEMO_MODE ? 'Download sample' : 'Download report'}</button>{error && <p className="text-xs text-[#8a3f36]">{error}</p>}</section>;
};
