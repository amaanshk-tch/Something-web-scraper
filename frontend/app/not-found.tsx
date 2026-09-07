import Link from 'next/link';
import { ArrowLeft, Search, FileQuestion } from 'lucide-react';

export const metadata = {
  title: '404 – Page Not Found | Apex Research',
  description: 'The page you were looking for could not be found.',
};

export default function NotFound() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-lg text-center">

        {/* Icon badge */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#c9c4b9] bg-white/70 shadow-[0_4px_16px_rgba(31,33,29,0.07)]">
          <FileQuestion className="h-7 w-7 text-[#5a5b52]" />
        </div>

        {/* Eyebrow label */}
        <p className="eyebrow mb-3">Error 404</p>

        {/* Headline */}
        <h1 className="font-serif text-5xl tracking-[-0.04em] text-[#20221d] sm:text-6xl">
          Page not found
        </h1>

        {/* Sub-copy */}
        <p className="mx-auto mt-5 max-w-sm text-base leading-7 text-[#74766f]">
          The source you&apos;re looking for doesn&apos;t exist or may have been moved.
          Try heading back to the workspace.
        </p>

        {/* Divider */}
        <div className="mx-auto mt-8 mb-8 w-12 border-t border-[#d9d5cb]" />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            id="not-found-home"
            className="primary-button inline-flex items-center gap-2 px-5 py-2.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <Link
            href="/dashboard"
            id="not-found-dashboard"
            className="quiet-button inline-flex items-center gap-2 px-5 py-2.5"
          >
            <Search className="h-3.5 w-3.5" />
            Open workspace
          </Link>
        </div>

        {/* Subtle footnote */}
        <p className="mt-10 text-[11px] uppercase tracking-[0.16em] text-[#99958b]">
          Apex Research · 2026
        </p>
      </div>
    </div>
  );
}
