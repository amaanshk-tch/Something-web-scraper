'use client';

import React from 'react';
import { useToast, ToastItem, ToastType } from '@/lib/toastContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const toastConfig: Record<
  ToastType,
  {
    icon: React.ComponentType<{ className?: string }>;
    borderColor: string;
    bgColor: string;
    iconColor: string;
    badgeBg: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    borderColor: 'border-[#b7d5bf]',
    bgColor: 'bg-[#f4f9f5]',
    iconColor: 'text-[#2e6b3e]',
    badgeBg: 'bg-[#e5f2e8]',
  },
  error: {
    icon: AlertCircle,
    borderColor: 'border-[#e2bcba]',
    bgColor: 'bg-[#fcf3f2]',
    iconColor: 'text-[#9c362d]',
    badgeBg: 'bg-[#f7e4e3]',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-[#dfd3b0]',
    bgColor: 'bg-[#fcf8ec]',
    iconColor: 'text-[#826928]',
    badgeBg: 'bg-[#f6eed2]',
  },
  info: {
    icon: Info,
    borderColor: 'border-[#c9c4b9]',
    bgColor: 'bg-[#f8f6f0]',
    iconColor: 'text-[#4b4c44]',
    badgeBg: 'bg-[#ece8de]',
  },
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast: ToastItem) => {
        const config = toastConfig[toast.type];
        const IconComponent = config.icon;

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-[0_8px_30px_rgba(31,33,29,0.12)] transition-all animate-slide-in-up ${config.borderColor} ${config.bgColor}`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.badgeBg}`}
            >
              <IconComponent className={`h-4 w-4 ${config.iconColor}`} />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-semibold text-[#1f211d] leading-snug">{toast.title}</p>
              {toast.message && (
                <p className="mt-1 text-xs text-[#5a5b52] leading-relaxed">{toast.message}</p>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-md p-1 text-[#8b877e] hover:bg-black/5 hover:text-[#1f211d] transition"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
