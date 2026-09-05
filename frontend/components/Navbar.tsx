'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { DEMO_MODE } from '@/lib/demoMode';
import { ArrowUpRight, LogOut, Search } from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-[#d9d5cb] bg-[#f5f2eb]/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1380px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#bdb9af] text-sm font-semibold tracking-tight">AR</span>
          <span className="font-serif text-xl tracking-[-0.02em]">Apex Research</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          {DEMO_MODE && <span className="hidden rounded-full border border-[#c7c1b5] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#74766f] sm:inline">Review mode</span>}
          {user ? (
            <>
              <Link href="/dashboard" className="quiet-button hidden items-center gap-2 sm:flex">
                <Search className="h-3.5 w-3.5" /> Analysis
              </Link>
              <div className="flex items-center gap-2 border-l border-[#d9d5cb] pl-3">
                <span className="hidden text-xs text-[#74766f] md:inline">{user.name || user.email}</span>
                <button onClick={() => void logout()} className="quiet-button flex items-center gap-1.5 !border-transparent !bg-transparent">
                  <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Log out</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="quiet-button">Sign in</Link>
              <Link href="/register" className="primary-button hidden sm:inline-flex">Get started <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
