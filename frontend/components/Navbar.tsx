'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { BarChart3, LogOut, Search, User as UserIcon } from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-slate-800/80 bg-slate-950/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-indigo-400 font-bold text-xl tracking-tight">
          <div className="w-8 h-8 rounded-md bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <span>Apex <span className="text-white">Research</span></span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800/60 transition"
              >
                <Search className="w-4 h-4 text-indigo-400" />
                <span>Analysis</span>
              </Link>
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  {user.name || user.email}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1.5 rounded transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800/60 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg shadow-sm shadow-indigo-600/30 transition"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
