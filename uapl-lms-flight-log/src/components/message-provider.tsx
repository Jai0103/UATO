"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

type MessageType = "success" | "error" | "info" | "warning" | "loading";

type NotifyOptions = {
  type?: MessageType;
  title: string;
  message?: string;
  durationMs?: number;
};

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

type MessageContextValue = {
  notify: (options: NotifyOptions) => void;
  clearMessage: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const MessageContext = createContext<MessageContextValue | null>(null);

const typeStyles: Record<MessageType, string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-brand-navy text-white",
  warning: "bg-amber-500 text-white",
  loading: "bg-brand-navy text-white"
};

function MessageIcon({ type }: { type: MessageType }) {
  if (type === "success") return <CheckCircle2 size={22} />;
  if (type === "error") return <XCircle size={22} />;
  if (type === "warning") return <AlertTriangle size={22} />;
  if (type === "loading") return <Loader2 size={22} className="animate-spin" />;
  return <Info size={22} />;
}

export function MessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<NotifyOptions | null>(null);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const [confirmResolver, setConfirmResolver] =
    useState<((value: boolean) => void) | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const notify = useCallback((options: NotifyOptions) => {
    setMessage(options);

    if (options.type !== "loading") {
      window.setTimeout(() => {
        setMessage(null);
      }, options.durationMs ?? 3500);
    }
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmOptions(options);

    return new Promise<boolean>((resolve) => {
      setConfirmResolver(() => resolve);
    });
  }, []);

  function closeConfirm(value: boolean) {
    confirmResolver?.(value);
    setConfirmResolver(null);
    setConfirmOptions(null);
  }

  const value = useMemo(
    () => ({
      notify,
      clearMessage,
      confirm
    }),
    [notify, clearMessage, confirm]
  );

  const messageType = message?.type ?? "info";

  return (
    <MessageContext.Provider value={value}>
      {children}

      {message ? (
        <div className="fixed inset-x-0 top-4 z-[90] flex justify-center px-4 sm:top-6">
          <div className="w-full max-w-md rounded-lg border border-white/20 bg-white shadow-2xl">
            <div className="flex gap-3 p-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${typeStyles[messageType]}`}
              >
                <MessageIcon type={messageType} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-950">
                  {message.title}
                </p>
                {message.message ? (
                  <p className="mt-1 text-sm text-slate-500">{message.message}</p>
                ) : null}
              </div>

              {messageType !== "loading" ? (
                <button
                  onClick={clearMessage}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close message"
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {confirmOptions ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 px-4 pb-4 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${
                  confirmOptions.variant === "danger"
                    ? "bg-red-600 text-white"
                    : "bg-brand-navy text-white"
                }`}
              >
                <AlertTriangle size={22} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-950">
                  {confirmOptions.title}
                </h2>
                {confirmOptions.message ? (
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {confirmOptions.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => closeConfirm(false)}
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {confirmOptions.cancelLabel ?? "Cancel"}
              </button>

              <button
                onClick={() => closeConfirm(true)}
                className={`inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-white ${
                  confirmOptions.variant === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-navy hover:bg-slate-800"
                }`}
              >
                {confirmOptions.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </MessageContext.Provider>
  );
}

export function useAppMessage() {
  const context = useContext(MessageContext);

  if (!context) {
    throw new Error("useAppMessage must be used inside MessageProvider");
  }

  return context;
}
