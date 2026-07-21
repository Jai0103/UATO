"use client";

import {
  Download,
  RefreshCw,
  Signal,
  SignalZero,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const BASE_PATH = "/UATO";

export function PwaManager() {
  const [online, setOnline] = useState(true);
  const [reconnected, setReconnected] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const wasOfflineRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    wasOfflineRef.current = !navigator.onLine;

    const handleOnline = () => {
      setOnline(true);
      if (wasOfflineRef.current) {
        setReconnected(true);
        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(
          () => setReconnected(false),
          3500
        );
      }
      wasOfflineRef.current = false;
    };
    const handleOffline = () => {
      wasOfflineRef.current = true;
      setReconnected(false);
      setOnline(false);
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowInstall(false);
      localStorage.removeItem("uapl-pwa-install-dismissed");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`, {
          scope: `${BASE_PATH}/`,
        })
        .then((registration) => {
          registrationRef.current = registration;

          if (registration.waiting) {
            setUpdateReady(true);
          }

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;

            worker.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {
          // The online application remains usable if registration fails.
        });

      const updateTimer = window.setInterval(() => {
        void registrationRef.current?.update();
      }, 15 * 60_000);

      let refreshing = false;
      const handleControllerChange = () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange
      );

      return () => {
        window.clearInterval(updateTimer);
        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        window.removeEventListener(
          "beforeinstallprompt",
          handleInstallPrompt
        );
        window.removeEventListener("appinstalled", handleInstalled);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange
        );
      };
    }

    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone
      );

    if (standalone) return;

    const dismissed = Number(
      localStorage.getItem("uapl-pwa-install-dismissed") || 0
    );
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (dismissed && Date.now() - dismissed < thirtyDays) return;

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream;

    if (isIos) {
      const timer = window.setTimeout(() => setShowInstall(true), 1800);
      return () => window.clearTimeout(timer);
    }
  }, []);

  async function installApplication() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        localStorage.setItem(
          "uapl-pwa-install-dismissed",
          String(Date.now())
        );
      }
      setInstallPrompt(null);
      setShowInstall(false);
      return;
    }

    setShowIosHelp(true);
  }

  function dismissInstall() {
    localStorage.setItem("uapl-pwa-install-dismissed", String(Date.now()));
    setShowInstall(false);
  }

  function applyUpdate() {
    const waiting = registrationRef.current?.waiting;

    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }

    window.location.reload();
  }

  return (
    <>
      {!online ? (
        <div
          role="status"
          className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[115] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-amber-200 bg-white px-4 py-3 shadow-xl sm:left-auto sm:right-5 sm:mx-0"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <SignalZero size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              You are offline
            </p>
            <p className="text-xs leading-5 text-slate-500">
              Draft changes remain on this device. Final saving needs internet.
            </p>
          </div>
        </div>
      ) : null}

      {online && reconnected ? (
        <div
          role="status"
          className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[115] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-xl sm:left-auto sm:right-5 sm:mx-0"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Signal size={18} />
          </div>
          <div className="min-w-0"><p className="text-sm font-semibold text-slate-950">Connection restored</p><p className="text-xs leading-5 text-slate-500">Online saving and synchronization are available again.</p></div>
        </div>
      ) : null}

      {online && showInstall && !updateReady ? (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[110] mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-2xl sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <Smartphone size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-950">
                Install Flight Management System
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Add it to your Home Screen for faster repeat access.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissInstall}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss installation"
            >
              <X size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void installApplication()}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Download size={17} />
            Install App
          </button>
        </div>
      ) : null}

      {updateReady && !updateDismissed ? (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[116] mx-auto max-w-md rounded-lg border border-sky-200 bg-white p-4 shadow-2xl sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <RefreshCw size={19} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-950">
                Application update ready
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Refresh to use the latest system version.
              </p>
            </div>
            <button type="button" onClick={() => setUpdateDismissed(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss update notification"><X size={16} /></button>
          </div>
          <button
            type="button"
            onClick={applyUpdate}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800"
          >
            <RefreshCw size={16} />
            Update Now
          </button>
        </div>
      ) : null}

      {showIosHelp ? (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setShowIosHelp(false)}
            aria-label="Close installation instructions"
          />
          <div className="relative w-full rounded-t-lg bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-lg sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Smartphone size={21} />
              </div>
              <button
                type="button"
                onClick={() => setShowIosHelp(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-950">
              Add to iPhone Home Screen
            </h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>1. Open this website in Safari.</li>
              <li>2. Tap the Share button at the bottom of Safari.</li>
              <li>3. Select <strong>Add to Home Screen</strong>.</li>
              <li>4. Tap <strong>Add</strong>.</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="mt-5 h-11 w-full rounded-md bg-slate-950 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
