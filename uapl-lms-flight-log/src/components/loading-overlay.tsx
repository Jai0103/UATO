import { Loader2 } from "lucide-react";

export function LoadingOverlay({ label = "Loading data..." }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-navy text-white">
          <Loader2 size={22} className="animate-spin" />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            Please wait while the system syncs records.
          </p>
        </div>
      </div>
    </div>
  );
}
