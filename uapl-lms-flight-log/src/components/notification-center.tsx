"use client";

import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchUserNotifications,
  setUserNotificationState,
  type AppNotification,
  type AppNotificationState
} from "@/lib/notifications-api";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function priorityClasses(notification: AppNotification) {
  if (notification.priority === "critical") return "bg-rose-50 text-rose-700";
  if (notification.priority === "warning") return "bg-amber-50 text-amber-700";
  return "bg-sky-50 text-sky-700";
}

export function NotificationCenter() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (quiet = false, force = false) => {
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      const result = await fetchUserNotifications(force);
      setNotifications(result.notifications);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Notifications could not be loaded.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const unreadCount = notifications.filter((item) => item.state === "unread").length;

  async function updateState(notification: AppNotification, state: AppNotificationState) {
    setUpdatingId(notification.id);
    try {
      await setUserNotificationState(notification.id, state);
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, state } : item
      ));
    } finally {
      setUpdatingId("");
    }
  }

  async function openNotification(notification: AppNotification) {
    if (notification.state === "unread") await updateState(notification, "read");
    setOpen(false);
    router.push(notification.actionUrl);
  }

  async function markAllRead() {
    const unread = notifications.filter((item) => item.state === "unread");
    if (!unread.length) return;
    setUpdatingId("all");
    try {
      await Promise.all(unread.map((item) => setUserNotificationState(item.id, "read")));
      setNotifications((current) => current.map((item) =>
        item.state === "unread" ? { ...item, state: "read" } : item
      ));
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void load(true);
        }}
        className="app-header-icon-button relative"
        aria-label={unreadCount ? `${unreadCount} unread notifications` : "Open notifications"}
        aria-expanded={open}
        title="Notifications"
      >
        {unreadCount ? <BellRing className="h-[19px] w-[19px]" /> : <Bell className="h-[19px] w-[19px]" />}
        {unreadCount ? (
          <span className="absolute right-0.5 top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <section className={`app-notification-popover absolute right-0 top-full z-[90] mt-2 w-[min(380px,calc(100vw-24px))] origin-top-right overflow-hidden rounded-lg border border-[#d7e0ea] bg-white shadow-[0_20px_50px_rgba(16,42,67,0.2)] transition ${open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`} aria-hidden={!open}>
        <div className="flex items-center justify-between gap-3 border-b border-[#e6ecf2] px-4 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-[#16263c]">Notifications</h2>
            <p className="mt-0.5 text-xs text-[#718096]">Tasks that may need your attention</p>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount ? (
              <button type="button" onClick={() => void markAllRead()} disabled={updatingId === "all"} className="app-header-icon-button h-9 w-9" aria-label="Mark all notifications as read" title="Mark all as read">
                {updatingId === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              </button>
            ) : null}
            <button type="button" onClick={() => void load(false, true)} disabled={loading} className="app-header-icon-button h-9 w-9" aria-label="Refresh notifications" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="max-h-[min(520px,70vh)] overflow-y-auto p-2">
          {loading && !notifications.length ? (
            <div className="flex min-h-44 items-center justify-center text-[#718096]"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : loadError && !notifications.length ? (
            <div className="px-4 py-8 text-center"><p className="text-sm font-semibold text-[#405168]">Notifications unavailable</p><p className="mt-1 text-xs leading-5 text-[#718096]">{loadError}</p></div>
          ) : !notifications.length ? (
            <div className="px-4 py-9 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCheck className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-[#405168]">You are all caught up</p><p className="mt-1 text-xs text-[#718096]">New assignments and important reminders will appear here.</p></div>
          ) : notifications.map((notification) => (
            <article key={notification.id} className={`app-notification-item mb-1 rounded-lg border px-3 py-3 transition last:mb-0 ${notification.state === "unread" ? "border-[#d9e8f5] bg-[#f5faff]" : "border-transparent bg-white"}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${priorityClasses(notification)}`}>
                  {notification.state === "follow_up" ? <Clock3 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold leading-5 text-[#16263c]">{notification.title}</p>
                    {notification.state === "unread" ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0866ff]" aria-label="Unread" /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#60748a]">{notification.message}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-[#8a99aa]">{formatNotificationDate(notification.eventDate)}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void openNotification(notification)} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#0866ff] px-3 text-xs font-bold text-white transition hover:bg-[#075ce5]">
                      {notification.actionLabel}<ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={updatingId === notification.id} onClick={() => void updateState(notification, notification.state === "follow_up" ? "unread" : "follow_up")} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-[#506278] transition hover:bg-[#eaf2f8] hover:text-[#075f8f] disabled:opacity-50">
                      {updatingId === notification.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />}
                      {notification.state === "follow_up" ? "Return to inbox" : "Follow up later"}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
