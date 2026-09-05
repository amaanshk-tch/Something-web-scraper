'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { ArrowRight, BookOpen, FileText, Search, ShieldCheck } from 'lucide-react';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="pb-16">
      <section className="grid min-h-[58vh] items-center gap-12 py-10 lg:grid-cols-[1.15fr_.85fr] lg:py-20">
        <div>
          <p className="eyebrow">Research workspace · 2026</p>
          <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.98] tracking-[-0.045em] text-[#20221d] sm:text-7xl">
            Evidence first.<br />Decisions clearer.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-[#74766f] sm:text-lg">
            A focused workspace for collecting source snippets, reviewing signals and turning research into a concise, presentable brief.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={user ? '/dashboard' : '/register'} className="primary-button inline-flex items-center gap-2 px-5 py-3">
              {user ? 'Open workspace' : 'Create account'} <ArrowRight className="h-4 w-4" />
            </Link>
            {!user && <Link href="/login" className="quiet-button px-5 py-3">Sign in</Link>}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-[#d9d5cb] px-6 py-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Current brief</span><span className="text-xs text-[#74766f]">Preview</span></div>
            <h2 className="mt-3 font-serif text-2xl">Market signals, without the noise.</h2>
          </div>
          <div className="space-y-4 p-6">
            {[
              ['01', 'Collect', 'Search result cards and source snippets.'],
              ['02', 'Review', 'Inspect mentions, sentiment and recurring themes.'],
              ['03', 'Report', 'Package the findings into a clean presentation.'],
            ].map(([n, title, copy]) => (
              <div key={n} className="grid grid-cols-[32px_1fr] gap-4 border-b border-[#e4e0d8] pb-4 last:border-0 last:pb-0">
                <span className="text-xs font-semibold text-[#99958b]">{n}</span>
                <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-[#74766f]">{copy}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#d9d5cb] pt-10">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [Search, 'Source review', 'A compact view of titles, snippets, links and keyword hits.'],
            [BookOpen, 'Research notes', 'Keep the important findings visible while you review a brief.'],
            [FileText, 'Presentation ready', 'Turn completed research into a shareable report.'],
          ].map(([Icon, title, copy]) => (
            <div key={title as string} className="border-l border-[#c9c4b9] pl-5">
              <Icon className="h-4 w-4 text-[#5a5b52]" />
              <h3 className="mt-4 font-serif text-xl">{title as string}</h3>
              <p className="mt-2 text-sm leading-6 text-[#74766f]">{copy as string}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-2 text-xs text-[#8a877f]"><ShieldCheck className="h-3.5 w-3.5" /> Built as a practical research tool, not an AI chat interface.</div>
      </section>
    </div>
  );
}
