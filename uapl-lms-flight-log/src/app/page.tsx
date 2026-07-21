"use client";

import {
  AlertCircle,
  AtSign,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  AuthApiError,
  getSecureSession,
  loginSecurely,
  verifySecureSession,
} from "@/lib/auth-api";

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null
  );
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkExistingSession() {
      const existingSession = getSecureSession();

      if (!existingSession) {
        if (active) setCheckingSession(false);
        return;
      }

      try {
        const verifiedSession = await verifySecureSession(existingSession);
        if (!active) return;

        if (verifiedSession.mustChangePassword) {
          router.replace("/change-password");
          return;
        }

        router.replace(
          verifiedSession.role === "admin" ? "/admin" : "/flight-logs"
        );
      } catch {
        if (active) setCheckingSession(false);
      }
    }

    void checkExistingSession();

    return () => {
      active = false;
    };
  }, [router]);

  function clearError() {
    if (loginError) setLoginError("");
    if (remainingAttempts !== null) setRemainingAttempts(null);
  }

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loggingIn) return;

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier || !password) {
      setLoginError("Enter your email or username and password.");
      return;
    }

    setLoginError("");
    setRemainingAttempts(null);
    setLoggingIn(true);

    try {
      const session = await loginSecurely(cleanIdentifier, password);

      if (session.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      router.replace(session.role === "admin" ? "/admin" : "/flight-logs");
    } catch (error) {
      if (error instanceof AuthApiError) {
        setLoginError(error.message);

        if (typeof error.remainingAttempts === "number") {
          setRemainingAttempts(error.remainingAttempts);
        }
        return;
      }

      setLoginError("Unable to sign in. Check your connection and try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f4f7fb] px-4">
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <div className="h-1 bg-sky-600" />
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Checking session
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Verifying your secure access...
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f4f7fb] px-4 py-6 sm:px-6 sm:py-10">
      <div className="absolute inset-x-0 top-0 h-1 bg-sky-600" />

      <section className="w-full max-w-[460px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-300/50">
        <header className="border-b border-slate-200 px-5 py-6 text-center sm:px-8 sm:py-7">
          <img
            src={LOGO_PATH}
            alt="Apollo Global Academy"
            className="mx-auto h-auto max-h-20 w-auto max-w-[230px] object-contain sm:max-w-[260px]"
          />
          <div className="mx-auto mt-5 flex w-max max-w-full items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Authorized account access
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-950">
            Flight Management System
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            Sign in with the account issued by your administrator.
          </p>
        </header>

        <div className="px-5 py-6 sm:px-8 sm:py-7">
          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Email or username
              </span>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    clearError();
                  }}
                  className="app-input mt-0 pl-10"
                  placeholder="Enter your account"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={loggingIn}
                  aria-invalid={Boolean(loginError)}
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError();
                  }}
                  onKeyDown={updateCapsLock}
                  onKeyUp={updateCapsLock}
                  onBlur={() => setCapsLockOn(false)}
                  className="app-input mt-0 pl-10 pr-12"
                  placeholder="Enter your password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  disabled={loggingIn}
                  aria-invalid={Boolean(loginError)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={loggingIn}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {capsLockOn ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is on
                </p>
              ) : null}
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => router.push("/forgot-password")}
                disabled={loggingIn}
                className="min-h-10 px-1 text-sm font-semibold text-sky-700 transition hover:text-sky-900 hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>

            {loginError ? (
              <div
                id="login-error"
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-rose-800"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold leading-5">
                    {loginError}
                  </p>
                  {remainingAttempts !== null && remainingAttempts > 0 ? (
                    <p className="mt-1 text-xs leading-5 text-rose-700">
                      {remainingAttempts} attempt
                      {remainingAttempts === 1 ? "" : "s"} remaining before
                      temporary lockout.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loggingIn}
              className="app-button-primary h-12 w-full justify-center"
            >
              {loggingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              {loggingIn ? "Signing in securely..." : "Sign in"}
            </button>
          </form>
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-xs text-slate-500">
          Apollo Global Academy
        </footer>
      </section>
    </main>
  );
}
