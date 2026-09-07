'use client';

import React, { useState } from 'react';
import { isAxiosError } from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { apiClient, getApiErrorMessage } from '@/lib/api';
import { UserPlus, Mail, Lock, User, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import type { User as AppUser } from '@/lib/types';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await apiClient.post<{ user: AppUser }>('/auth/register', { name, email, password });
      login(res.data.user);
      router.push('/dashboard');
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, 'Registration failed'));
      if (!isAxiosError(error)) {
        console.error('Unexpected registration error:', error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="rounded-2xl border border-[#c9c4b9] bg-white/70 shadow-[0_4px_16px_rgba(31,33,29,0.08)] flex items-center justify-center mb-4"
            style={{ width: '52px', height: '52px' }}
          >
            <UserPlus className="w-6 h-6 text-[#5a5b52]" />
          </div>
          <p className="eyebrow mb-2">Apex Research</p>
          <h1 className="font-serif text-3xl tracking-[-0.03em] text-[#20221d]">Create an account</h1>
          <p className="mt-2 text-sm text-[#74766f]">Get started with your research workspace</p>
        </div>

        {/* Card */}
        <div className="panel p-7">
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-[#d9b9b3] bg-[#fbf1ef] px-4 py-3 text-sm text-[#8a3f36]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label mb-2 block">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-[#99958b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="register-name"
                  type="text"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#d9d5cb] bg-white/60 text-sm text-[#1f211d] placeholder-[#b0aba3] focus:outline-none focus:border-[#85867c] focus:ring-2 focus:ring-[#85867c]/20 transition"
                />
              </div>
            </div>

            <div>
              <label className="label mb-2 block">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#99958b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="register-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  id="register-password"
                  type="password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#d9d5cb] bg-white/60 text-sm text-[#1f211d] placeholder-[#b0aba3] focus:outline-none focus:border-[#85867c] focus:ring-2 focus:ring-[#85867c]/20 transition"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[#99958b]">Minimum 12 characters required</p>
            </div>

            <button
              id="register-submit"
              type="submit"
              disabled={submitting}
              className="primary-button w-full mt-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating profile…</span>
                </>
              ) : (
                <>
                  <span>Complete Registration</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-[#e4e0d8] pt-5 text-center text-sm text-[#74766f]">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[#3a3c33] underline underline-offset-4 hover:text-[#1f211d] transition">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
