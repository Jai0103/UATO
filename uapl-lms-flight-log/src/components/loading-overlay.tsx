"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type LoadingOverlayProps = {
  label: string;
  description?: string;
  delay?: number;
};

export function LoadingOverlay({
  label,
  description = "Please wait while the request is completed.",
  delay = 120,
}: LoadingOverlayProps) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) {
      setVisible(true);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-lg border border-white/70 bg-white p-5 shadow-2xl shadow-slate-950/20 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>

          <div className="min-w-0 pt-0.5">
            <p className="break-words text-base font-semibold text-slate-950">
              {label}
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-sky-600" />
        </div>
      </div>
    </div>
  );
}
