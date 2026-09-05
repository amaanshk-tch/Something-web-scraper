'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { ArrowRight, Database, FileSpreadsheet, Globe, Zap } from 'lucide-react';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center pt-8 pb-16">

      <h1 className="text-4xl sm:text-6xl font-extrabold text-center tracking-tight max-w-4xl leading-tight">
        Search result snippets,{' '}
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400">
          summarized clearly
        </span>
      </h1>

      <p className="mt-6 text-base sm:text-lg text-slate-400 text-center max-w-2xl leading-relaxed">
        Retrieve result cards, inspect keyword hits and heuristic sentiment, then export a concise PowerPoint report.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        {user ? (
          <Link
            href="/dashboard"
            className="px-6 py-3.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 transition text-sm"
          >
            <span>Open Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <>
            <Link
              href="/register"
              className="px-6 py-3.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 transition text-sm"
            >
              <span>Create Account</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="px-6 py-3.5 rounded-md bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold transition text-sm"
            >
              Sign In
            </Link>
          </>
        )}
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-4 gap-4 w-full max-w-6xl">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg hover:border-slate-700 transition">
          <div className="w-10 h-10 rounded-md bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">Frontend Dashboard</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Submit jobs, monitor status, browse result cards, and download generated decks.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg hover:border-slate-700 transition">
          <div className="w-10 h-10 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">Backend API</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Handles authentication, job enqueueing, rate limits, and result persistence.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg hover:border-slate-700 transition">
          <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">Snippet Worker</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Retrieves search-result cards and applies simple lexical sentiment heuristics.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg hover:border-slate-700 transition">
          <div className="w-10 h-10 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">Presentation Service</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Builds PowerPoint decks with charts, bullets, and source tables.
          </p>
        </div>
      </div>
    </div>
  );
}
