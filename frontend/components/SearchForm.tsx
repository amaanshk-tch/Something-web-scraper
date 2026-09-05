'use client';

import React, { useState } from 'react';
import { Layers, Search } from 'lucide-react';
import type { SearchPayload } from '@/lib/types';

interface SearchFormProps { onSearch: (payload: SearchPayload) => Promise<void>; loading: boolean; }

export const SearchForm = ({ onSearch, loading }: SearchFormProps) => {
  const [topic, setTopic] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [depth, setDepth] = useState(5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    await onSearch({ topic: topic.trim(), keywords: keywordInput.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20), depth });
  };

  return (
    <form onSubmit={handleSubmit} className="panel p-6 sm:p-7">
      <div className="flex items-end justify-between gap-4 border-b border-[#e1ddd4] pb-5">
        <div><p className="eyebrow">New analysis</p><h2 className="mt-1 font-serif text-2xl">What are you investigating?</h2></div>
        <span className="hidden text-xs text-[#99958b] sm:block">Sources are reviewed after submission</span>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr_180px]">
        <label><span className="label">Topic</span><input required maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Solid-state battery commercialization" className="mt-2 w-full rounded-lg border border-[#d2cec4] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition placeholder:text-[#aaa69d] focus:border-[#77786f]" /></label>
        <label><span className="label">Keywords</span><input maxLength={1619} value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="cost, patents, OEM, scale" className="mt-2 w-full rounded-lg border border-[#d2cec4] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition placeholder:text-[#aaa69d] focus:border-[#77786f]" /></label>
        <label><span className="label flex items-center justify-between"><span>Source depth</span><span className="font-mono text-[#30322b]">{depth}</span></span><div className="mt-4 flex items-center gap-3"><Layers className="h-4 w-4 text-[#77786f]" /><input type="range" min="3" max="15" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-[#33352e]" /></div></label>
      </div>
      <div className="mt-6 flex justify-end"><button disabled={loading || !topic.trim()} className="primary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"><Search className="h-4 w-4" /> {loading ? 'Reviewing sources…' : 'Run analysis'}</button></div>
    </form>
  );
};
