'use client';

import React, { useState } from 'react';
import { Search, Hash, Layers, Loader2 } from 'lucide-react';
import type { SearchPayload } from '@/lib/types';

interface SearchFormProps {
  onSearch: (payload: SearchPayload) => Promise<void>;
  loading: boolean;
}

export const SearchForm = ({ onSearch, loading }: SearchFormProps) => {
  const [topic, setTopic] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [depth, setDepth] = useState(5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const keywords = keywordInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20);

    await onSearch({ topic: topic.trim(), keywords, depth });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-900 border border-slate-800 p-5 rounded-lg"
    >
      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Topic
          </label>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              required
              maxLength={200}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Solid State Batteries Commercialization 2026"
              className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-700/80 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-indigo-400" />
              <span>Keywords (comma separated)</span>
            </label>
            <input
              type="text"
              maxLength={1619}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="e.g., energy density, patent, cost, OEM, mass production"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Sources: <span className="text-indigo-400 font-bold">{depth}</span></span>
              </label>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="range"
                min="3"
                max="15"
                step="1"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md flex items-center gap-2.5 transition text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting analysis...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Run analysis</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
