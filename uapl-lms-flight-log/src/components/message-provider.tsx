"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export type MessageType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading";

export type MessageOptions = {
  type: MessageType;
  title: string;
  message?: string;
  duration?: number;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

type ActiveMessage = MessageOptions & {
  id: number;
};

type ActiveConfirmation = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export type MessageContextValue = {
  notify: (options: MessageOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  clearMessage: () => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const MessageContext = createContext<MessageContextValue | null>(null);

const messageStyles: Record<
  MessageType,
  {
    icon: typeof CheckCircle2;
    iconClass: string;
    panelClass: string;
    barClass: string;
    label: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    panelClass: "border-emerald-200",
    barClass: "bg-emerald-500",
    label: "Success",
  },
  error: {
    icon: XCircle,
    iconClass: "bg-rose-50 text-rose-700 ring-rose-200",
    panelClass: "border-rose-200",
    barClass: "bg-rose-500",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "bg-amber-50 text-amber-700 ring-amber-200",
    panelClass: "border-amber-200",
    barClass: "bg-amber-500",
    label: "Warning",
  },
  info: {
    icon: Info,
    iconClass: "bg-sky-50 text-sky-700 ring-sky-200",
    panelClass: "border-sky-200",
    barClass: "bg-sky-500",
    label: "Information",
  },
  loading: {
    icon: Loader2,
    iconClass: "bg-slate-100 text-slate-700 ring-slate-200",
    panelClass: "border-slate-200",
    barClass: "bg-slate-700",
    label: "In progress",
  },
};

export function MessageProvider({ children }: { children: ReactNode }) {
  const [activeMessage, setActiveMessage] = useState<ActiveMessage | null>(null);
  const [confirmation, setConfirmation] =
    useState<ActiveConfirmation | null>(null);
  const messageSequence = useRef(0);
  const dismissTimer = useRef<number | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const clearMessage = useCallback(() => {
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }

    setActiveMessage(null);
  }, []);

  const notify = useCallback(
    (options: MessageOptions) => {
      if (dismissTimer.current !== null) {
        window.clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }

      messageSequence.current += 1;
      const message = {
        ...options,
        id: messageSequence.current,
      };

      setActiveMessage(message);

      if (options.type !== "loading") {
        const duration = Math.max(2500, options.duration ?? 5000);
        dismissTimer.current = window.setTimeout(() => {
          setActiveMessage((current) =>
            current?.id === message.id ? null : current
          );
          dismissTimer.current = null;
        }, duration);
      }
    },
    []
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmation((current) => {
        if (current) current.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const settleConfirmation = useCallback((confirmed: boolean) => {
    setConfirmation((current) => {
      if (current) current.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimer.current !== null) {
        window.clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!confirmation) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => confirmButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settleConfirmation(false);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmation, settleConfirmation]);

  const value: MessageContextValue = {
    notify,
    confirm,
    clearMessage,
    success: (title, message) => notify({ type: "success", title, message }),
    error: (title, message) => notify({ type: "error", title, message }),
    warning: (title, message) => notify({ type: "warning", title, message }),
    info: (title, message) => notify({ type: "info", title, message }),
  };

  return (
    <MessageContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[130] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:block sm:w-[420px]"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeMessage ? (
          <Toast message={activeMessage} onClose={clearMessage} />
        ) : null}
      </div>

      {confirmation ? (
        <ConfirmationDialog
          confirmation={confirmation}
          confirmButtonRef={confirmButtonRef}
          onConfirm={() => settleConfirmation(true)}
          onCancel={() => settleConfirmation(false)}
        />
      ) : null}
    </MessageContext.Provider>
  );
}

export function useAppMessage() {
  const context = useContext(MessageContext);

  if (!context) {
    throw new Error("useAppMessage must be used inside MessageProvider.");
  }

  return context;
}

function Toast({
  message,
  onClose,
}: {
  message: ActiveMessage;
  onClose: () => void;
}) {
  const style = messageStyles[message.type];
  const Icon = style.icon;
  const isLoading = message.type === "loading";
  const isError = message.type === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`app-panel-enter pointer-events-auto w-full overflow-hidden rounded-lg border bg-white shadow-[0_18px_44px_rgba(16,42,67,0.18)] ${style.panelClass}`}
    >
      <div className={`h-1 w-full ${style.barClass}`} />
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${style.iconClass}`}
        >
          <Icon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-semibold uppercase text-[#718096]">
            {style.label}
          </p>
          <p className="mt-0.5 break-words text-sm font-semibold text-[#16263c]">
            {message.title}
          </p>
          {message.message ? (
            <p className="mt-1 break-words text-sm leading-5 text-[#5f7187]">
              {message.message}
            </p>
          ) : null}
        </div>

        {!isLoading ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[#8493a5] transition hover:border-[#d7e0ea] hover:bg-[#f3f7fa] hover:text-[#405168]"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="h-1 overflow-hidden bg-[#e8eef4]">
          <div className="h-full w-1/3 animate-pulse bg-[#075f8f]" />
        </div>
      ) : null}
    </div>
  );
}

function ConfirmationDialog({
  confirmation,
  confirmButtonRef,
  onConfirm,
  onCancel,
}: {
  confirmation: ActiveConfirmation;
  confirmButtonRef: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const danger = confirmation.variant === "danger";

  return (
    <div className="app-overlay-enter fixed inset-0 z-[140] flex items-end justify-center p-0 sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-[#102a43]/60 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-label="Cancel confirmation"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="global-confirm-title"
        aria-describedby="global-confirm-message"
        className="app-panel-enter relative max-h-[92dvh] w-full overflow-hidden rounded-t-lg border border-[#d7e0ea] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_24px_64px_rgba(16,42,67,0.3)] sm:max-w-md sm:rounded-lg sm:pb-0"
      >
        <div className={`h-1 w-full ${danger ? "bg-rose-600" : "bg-[#075f8f]"}`} />
        <div className="p-5 sm:p-6">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ring-inset ${
              danger
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : "bg-[#edf5f8] text-[#075f8f] ring-[#cce3ed]"
            }`}
          >
            {danger ? <ShieldAlert size={22} /> : <Info size={22} />}
          </div>

          <h2
            id="global-confirm-title"
            className="mt-4 text-xl font-semibold text-[#16263c]"
          >
            {confirmation.title}
          </h2>
          <p
            id="global-confirm-message"
            className="mt-2 break-words text-sm leading-6 text-[#5f7187]"
          >
            {confirmation.message}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[#e1e8ef] bg-[#f7f9fb] p-4 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[#c3cfdd] bg-white px-4 text-sm font-semibold text-[#405168] shadow-sm transition hover:bg-[#eef3f7] sm:h-11"
          >
            {confirmation.cancelLabel || "Cancel"}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-12 items-center justify-center rounded-md px-4 text-sm font-semibold text-white transition sm:h-11 ${
              danger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-[#075f8f] shadow-[0_5px_14px_rgba(7,95,143,0.2)] hover:bg-[#064d75]"
            }`}
          >
            {confirmation.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
