'use client';

import React, { useState } from 'react';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/lib/toastContext';
import { DEMO_MODE } from '@/lib/demoMode';
import { ArrowDownToLine, FileText, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

export const DeckDownload = ({ jobId, topic }: { jobId: string; topic: string }) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const { toast } = useToast();

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setDownloaded(false);

    try {
      if (DEMO_MODE) {
        const blob = new Blob(
          [
            JSON.stringify(
              {
                demo: true,
                jobId,
                topic,
                note: 'Demo report placeholder. Connect the presentation service for a real PowerPoint export.',
              },
              null,
              2
            ),
          ],
          { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Research_Report_${topic.replace(/\s+/g, '_')}.json`;
        link.click();
        URL.revokeObjectURL(url);

        setDownloaded(true);
        toast.success('Demo report ready', 'Sample JSON report downloaded successfully.');
        return;
      }

      const response = await apiClient.get(`/jobs/${jobId}/presentation`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Research_Report_${topic.replace(/\s+/g, '_')}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setDownloaded(true);
      toast.success('Download complete', 'PowerPoint presentation exported successfully.');
    } catch (e) {
      const errorMsg = getApiErrorMessage(
        e,
        'Could not generate the presentation report. Please try again.'
      );
      setError(errorMsg);
      toast.error('Export failed', errorMsg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#cfcac0]">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="font-serif text-lg">Report ready</p>
            <p className="mt-0.5 text-xs text-[#74766f]">
              {DEMO_MODE
                ? 'Demo export is a sample JSON report placeholder.'
                : 'Generate and export the PowerPoint presentation.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {downloaded && !downloading && (
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-[#2e6b3e] sm:inline-flex animate-fade-in">
              <CheckCircle2 className="h-3.5 w-3.5" /> Downloaded
            </span>
          )}
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="primary-button inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Preparing report…</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="h-4 w-4" />
                <span>{DEMO_MODE ? 'Download sample' : 'Download report'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#d9b9b3] bg-[#fbf1ef] px-3.5 py-2 text-xs text-[#8a3f36] animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#9c362d]" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-[#8a3f36]/70 hover:text-[#8a3f36]"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
};
