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
} from "@/lib/auth-api";
import { LoadingScreen } from "@/components/loading-overlay";
import { preferredHome } from "@/lib/app-preferences";

const APP_BASE = process.env.NODE_ENV === "production" ? "/UATO" : "";
const LOGO_PATH = `${APP_BASE}/AGA_Logo_fullcolor_Horizontal%20(1).png`;
const LOGIN_VISUAL_PATH = `${APP_BASE}/uato-login-visual.png`;

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
    const existingSession = getSecureSession();

    if (!existingSession) {
      setCheckingSession(false);
      return;
    }

    if (existingSession.mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    // The stored session already contains a signed token and an expiry time.
    // AppShell performs the periodic server-side account-status check, so the
    // login page can route immediately without adding another Apps Script call.
    router.replace(preferredHome(existingSession.role, existingSession.permissions));
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
      setLoginError("Enter your registered email and password.");
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

      router.replace(preferredHome(session.role, session.permissions));
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
    return <LoadingScreen label="Checking session" description="Preparing your workspace" />;
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f8fc] lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(430px,0.82fr)]">
      <section className="relative hidden min-h-[100dvh] overflow-hidden bg-white lg:block" aria-label="UATO training operations">
        <img
          src={LOGIN_VISUAL_PATH}
          alt="Apollo Global Academy UATO training operations"
          className="absolute left-0 top-0 h-[112%] w-auto max-w-none object-cover object-left-top"
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#f4f8fc] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#f4f8fc] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#f4f8fc] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-r from-transparent to-[#f4f8fc]" />
      </section>

      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-7 sm:px-8 sm:py-10 lg:px-10 xl:px-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0b2e68] via-[#1467b0] to-[#ef2b33] lg:hidden" />

        <div className="app-panel-enter w-full max-w-[490px]">
          <header className="mb-7 text-center lg:text-left">
            <img
              src={LOGO_PATH}
              alt="Apollo Global Academy"
              className="mx-auto h-auto max-h-16 w-auto max-w-[220px] object-contain lg:hidden"
            />
            <p className="mt-7 text-xs font-bold uppercase text-[#1467b0] lg:mt-0">
              Secure staff access
            </p>
            <h1 className="mt-2 text-[28px] font-bold leading-[1.15] text-[#0b234f] sm:text-[34px]">
              Sign in to your<br className="hidden sm:block" /> UATO Management System
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#6b7d92]">
              Use the account issued by your administrator.
            </p>
          </header>

          <div className="rounded-lg border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_36px_rgba(35,69,105,0.08),0_2px_8px_rgba(35,69,105,0.05)] sm:p-8">
            <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#405168]">
                Email address
              </span>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" />
                <input
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    clearError();
                  }}
                  className="app-input mt-0 h-[52px] pl-10"
                  placeholder="Email or staff account"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={loggingIn}
                  aria-invalid={Boolean(loginError)}
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#405168]">
                Password
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" />
                <input
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError();
                  }}
                  onKeyDown={updateCapsLock}
                  onKeyUp={updateCapsLock}
                  onBlur={() => setCapsLockOn(false)}
                  className="app-input mt-0 h-[52px] pl-10 pr-12"
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
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#6b7d92] transition hover:bg-[#edf3f7] hover:text-[#075f8f] disabled:opacity-50"
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

            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={() => router.push("/forgot-password")}
                disabled={loggingIn}
                className="min-h-10 px-1 text-sm font-semibold text-[#0965c1] transition hover:text-[#064d75] hover:underline disabled:opacity-50"
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
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0b2e68] to-[#0d4c97] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(11,46,104,0.22)] transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
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

          <footer className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-[#718096] lg:justify-start">
            <ShieldCheck className="h-3.5 w-3.5 text-[#075f8f]" />
            Secure access · Powered by: JO
          </footer>
        </div>
      </section>
    </main>
  );
}
