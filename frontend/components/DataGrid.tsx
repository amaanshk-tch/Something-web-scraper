'use client';

import React, { useState } from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ResultItem } from '@/lib/types';

interface DataGridProps {
  results: ResultItem[];
}

export const DataGrid = ({ results }: DataGridProps) => {
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const totalPages = Math.ceil(results.length / pageSize);
  const displayed = results.slice((page - 1) * pageSize, page * pageSize);

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <TrendingUp className="w-3 h-3" /> Positive
          </span>
        );
      case 'negative':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/20">
            <TrendingDown className="w-3 h-3" /> Negative
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/20">
            <Minus className="w-3 h-3" /> Neutral
          </span>
        );
    }
  };

  if (!results.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-lg text-center text-slate-400">
        No sources found for this analysis.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      <div className="p-5 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-white text-base">Sources</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Displaying parsed snippets and keyword hits from each result card
          </p>
        </div>
        <span className="text-xs font-medium text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
          Total Sources: {results.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Source Title & URL</th>
              <th className="py-3 px-4">Snippet</th>
              <th className="py-3 px-4">Sentiment</th>
              <th className="py-3 px-4 text-center">Keyword Hits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {displayed.map((item) => (
              <tr key={item.id} className="hover:bg-slate-800/30 transition">
                <td className="py-3.5 px-4 max-w-xs">
                  <div className="font-medium text-slate-200 line-clamp-1">{item.title}</div>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-0.5 truncate"
                  >
                    <span className="truncate">{item.sourceUrl}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </td>
                <td className="py-3.5 px-4 text-slate-400 text-xs max-w-md">
                  <p className="line-clamp-2">{item.snippet}</p>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  {getSentimentBadge(item.sentiment)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="inline-block px-2.5 py-1 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 text-xs font-bold font-mono">
                    {item.mentions}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, results.length)} of {results.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page === 1}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1 bg-slate-800/60 rounded text-slate-200">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
