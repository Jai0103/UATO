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
      className="app-overlay-enter fixed inset-0 z-[120] flex items-center justify-center bg-[#102a43]/50 p-4 backdrop-blur-[3px]"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="app-panel-enter w-full max-w-sm overflow-hidden rounded-lg border border-white/70 bg-white shadow-[0_24px_60px_rgba(16,42,67,0.28)]">
        <div className="grid h-1 grid-cols-[1fr_48px]">
          <span className="bg-[#075f8f]" />
          <span className="bg-[#c7353d]" />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#102a43] text-[#70c8e8] shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>

            <div className="min-w-0 pt-0.5">
              <p className="break-words text-base font-semibold text-[#16263c]">
                {label}
              </p>
              <p className="mt-1 text-sm leading-5 text-[#6b7d92]">
                {description}
              </p>
            </div>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e8eef4]">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-[#1686b1]" />
          </div>
        </div>
      </div>
    </div>
  );
}
