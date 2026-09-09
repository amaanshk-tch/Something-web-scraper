'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { isAxiosError } from 'axios';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/lib/toastContext';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { ShieldCheck, Mail, Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { User } from '@/lib/types';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  /* eslint-disable react-hooks/set-state-in-effect -- transient one-time notice derived from the URL, cleared on submit */
  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setNotice('Account created successfully! Please sign in with your email and password.');
    } else if (searchParams.get('logged_out') === '1') {
      setNotice('You have been logged out successfully.');
    }
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    // Client-side validation
    if (!email.trim() || !password) {
      setError('Please provide both your email address and password.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiClient.post<{ user: User; message?: string }>('/auth/login', {
        email: email.trim(),
        password,
      });

      setSuccess('Signed in successfully! Redirecting to workspace…');
      toast.success('Signed in successfully', `Welcome back, ${res.data.user.name || res.data.user.email}!`);
      login(res.data.user);

      setTimeout(() => {
        router.push('/dashboard');
      }, 600);
    } catch (err: unknown) {
      const errorMsg = getApiErrorMessage(err, 'Invalid email or password. Please check your credentials.');
      setError(errorMsg);
      toast.error('Authentication failed', errorMsg);

      if (!isAxiosError(err)) {
        console.error('Unexpected login error:', err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div
          className="rounded-2xl border border-[#c9c4b9] bg-white/70 shadow-[0_4px_16px_rgba(31,33,29,0.08)] flex items-center justify-center mb-4"
          style={{ width: '52px', height: '52px' }}
        >
          <ShieldCheck className="w-6 h-6 text-[#5a5b52]" />
        </div>
        <p className="eyebrow mb-2">Apex Research</p>
        <h1 className="font-serif text-3xl tracking-[-0.03em] text-[#20221d]">Welcome back</h1>
        <p className="mt-2 text-sm text-[#74766f]">Sign in to manage your analyses</p>
      </div>

      {/* Card */}
      <div className="panel p-7">
        {/* Info Notice (e.g. from logout or registration) */}
        {notice && (
          <div className="mb-5 flex items-start justify-between gap-2.5 rounded-lg border border-[#c9c4b9] bg-[#f7f5ee] px-4 py-3 text-sm text-[#4e5048] animate-fade-in">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2e6b3e]" />
              <span>{notice}</span>
            </div>
            <button
              onClick={() => setNotice(null)}
              className="text-[#8b877e] hover:text-[#1f211d] p-0.5"
              aria-label="Dismiss notice"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-[#b7d5bf] bg-[#f4f9f5] px-4 py-3 text-sm text-[#245431] animate-fade-in">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2e6b3e]" />
            <span>{success}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-5 flex items-start justify-between gap-2.5 rounded-lg border border-[#d9b9b3] bg-[#fbf1ef] px-4 py-3 text-sm text-[#8a3f36] animate-fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9c362d]" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[#9c362d]/70 hover:text-[#9c362d] p-0.5"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label mb-2 block">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#99958b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="analyst@enterprise.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#d9d5cb] bg-white/60 text-sm text-[#1f211d] placeholder-[#b0aba3] focus:outline-none focus:border-[#85867c] focus:ring-2 focus:ring-[#85867c]/20 transition"
              />
            </div>
          </div>

          <div>
            <label className="label mb-2 block">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#99958b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Your password"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#d9d5cb] bg-white/60 text-sm text-[#1f211d] placeholder-[#b0aba3] focus:outline-none focus:border-[#85867c] focus:ring-2 focus:ring-[#85867c]/20 transition"
              />
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            disabled={submitting}
            className="primary-button w-full mt-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating…</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-[#e4e0d8] pt-5 text-center text-sm text-[#74766f]">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-semibold text-[#3a3c33] underline underline-offset-4 hover:text-[#1f211d] transition">
            Register now
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <Suspense fallback={<div className="text-sm text-[#74766f]">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
