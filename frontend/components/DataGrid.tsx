'use client';
import React, { useEffect, useState } from 'react';
import {
  Ban,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitCompare,
  Minus,
  NotebookPen,
  Quote,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { ResultItem } from '@/lib/types';

export const DataGrid = ({ results }: { results: ResultItem[] }) => {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [results.length, page, totalPages]);

  const displayed = results.slice((page - 1) * pageSize, page * pageSize);

  if (!results.length) {
    return <div className="panel p-10 text-center text-sm text-[#74766f]">No sources found for this analysis.</div>;
  }

  const badge = (s: string) => {
    const lower = s.toLowerCase();
    const positive = lower === 'positive';
    const negative = lower === 'negative';
    const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5" />
        {s}
      </span>
    );
  };

  const published = (item: ResultItem) => item.published ?? item.createdAt ?? '—';
  const publisher = (item: ResultItem) => item.publisher ?? item.sourceUrl.replace(/^https?:\/\//, '').split('/')[0] ?? 'Unknown publisher';
  const relevance = (item: ResultItem) => `${Math.min(99, Math.max(0, Math.round((item.relevance ?? item.mentions ?? 1) * 10)))}%`;

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-end justify-between border-b border-[#d9d5cb] px-5 py-5">
        <div>
          <p className="eyebrow">Evidence</p>
          <h3 className="mt-1 font-serif text-2xl">Source review</h3>
        </div>
        <span className="text-xs text-[#74766f]">{results.length} sources</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left">
          <thead className="border-b border-[#e1ddd4] text-[10px] uppercase tracking-[0.14em] text-[#8b887f]">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Publisher</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Relevance</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Sentiment</th>
              <th className="px-4 py-3">Claims</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((item) => (
              <tr key={item.id} className="border-b border-[#ece8e0] align-top last:border-0 hover:bg-[#faf8f3]">
                <td className="max-w-[260px] px-4 py-4">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-xs text-[#74766f] hover:text-[#20221d]">
                    <span className="truncate">{item.sourceUrl}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </td>
                <td className="px-4 py-4 text-sm text-[#5f615a]">{publisher(item)}</td>
                <td className="px-4 py-4 text-sm text-[#5f615a]">{published(item)}</td>
                <td className="px-4 py-4">
                  <span className="font-mono text-sm font-semibold text-[#3c6e51]">{relevance(item)}</span>
                </td>
                <td className="max-w-[280px] px-4 py-4 text-sm leading-6 text-[#74766f]">
                  {item.evidence ?? item.snippet}
                </td>
                <td className="px-4 py-4">{badge(item.sentiment)}</td>
                <td className="px-4 py-4">
                  <span className="font-mono text-sm text-[#5f615a]">{item.claims?.length ?? item.mentions ?? 0}</span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="quiet-button !p-1.5" title="Open source">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button className="quiet-button !p-1.5" title="Save source (unavailable)" aria-label="Save source (unavailable)" disabled>
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                    <button className="quiet-button !p-1.5" title="Add note (unavailable)" aria-label="Add note (unavailable)" disabled>
                      <NotebookPen className="h-3.5 w-3.5" />
                    </button>
                    <button className="quiet-button !p-1.5" title="Compare sources (unavailable)" aria-label="Compare sources (unavailable)" disabled>
                      <GitCompare className="h-3.5 w-3.5" />
                    </button>
                    <button className="quiet-button !p-1.5" title="Exclude source (unavailable)" aria-label="Exclude source (unavailable)" disabled>
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                    <button className="quiet-button !p-1.5" title="Cite source (unavailable)" aria-label="Cite source (unavailable)" disabled>
                      <Quote className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#d9d5cb] px-5 py-3 text-xs text-[#74766f]">
          <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, results.length)} of {results.length}</span>
          <div className="flex items-center gap-2">
            <button className="quiet-button !p-1.5 disabled:opacity-30" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>{page} / {totalPages}</span>
            <button className="quiet-button !p-1.5 disabled:opacity-30" aria-label="Next page" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
