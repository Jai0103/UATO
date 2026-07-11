"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Lock, Mail, Plane } from "lucide-react";
import { useRouter } from "next/navigation";
import { sessionKey } from "@/lib/demo-auth";
import {
  getStoredUsers,
  type ManagedUser,
} from "@/lib/user-storage";
import { fetchGoogleUsers } from "@/lib/google-api";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwjmTFIGbGSHhaxj9ds86l5_Vgx6vuovgQZpfNRSexZH5T336eLEylJiWoKaPkAkHnZPg/exec";

export default function LoginPage() {
  const router = useRouter();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [loginError, setLoginError] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    async function loadUsers() {
      try {
        const googleUsers = await fetchGoogleUsers();

        if (googleUsers.length > 0) {
          setUsers(googleUsers);
          return;
        }

        setUsers(getStoredUsers());
      } catch {
        setUsers(getStoredUsers());
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, []);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoginError("");
    setLoggingIn(true);

    const cleanIdentifier = identifier.trim().toLowerCase();
    const cleanPassword = password.trim();

    const user = users.find((item) => {
      const nameMatches = item.name.trim().toLowerCase() === cleanIdentifier;
      const emailMatches = item.email.trim().toLowerCase() === cleanIdentifier;
      const passwordMatches = item.temporaryPassword === cleanPassword;

      return (nameMatches || emailMatches) && passwordMatches;
    });

    if (!user) {
      setLoginError("Invalid username, email, or password.");
      setLoggingIn(false);
      return;
    }

    const mustChangePassword = !user.passwordChangedAt;

    localStorage.setItem(
      sessionKey,
      JSON.stringify({
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword,
      })
    );

    if (mustChangePassword) {
      router.push("/change-password");
      return;
    }

    router.push(user.role === "admin" ? "/admin" : "/flight-logs");
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setForgotMessage("");
    setForgotError("");

    const cleanIdentifier = forgotIdentifier.trim();

    if (!cleanIdentifier) {
      setForgotError("Enter your email or username first.");
      return;
    }

    setSendingReset(true);

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "forgotPassword",
          identifier: cleanIdentifier,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setForgotError(result.message || "Password reset failed.");
        return;
      }

      setForgotMessage(
        result.message || "A temporary password has been sent to your email."
      );
      setForgotIdentifier("");
    } catch {
      setForgotError(
        "Unable to send password reset. Please check the Google Apps Script deployment."
      );
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f6fb] px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-48px)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden lg:block">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <Plane className="h-4 w-4 text-sky-600" />
            UAPL LMS Flight Operations
          </div>

          <h1 className="max-w-xl text-5xl font-bold tracking-tight text-slate-950">
            Premium flight log management for trainers and administrators.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Record student flights, manage master data, generate reports, and
            keep operational records organized from desktop, tablet, or mobile.
          </p>

          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {["Flight Logs", "Reports", "Admin Control"].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
              <Plane className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700">
                UAPL LMS
              </p>
              <h1 className="text-xl font-bold text-slate-950">Flight Logs</h1>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <div className="border-b border-slate-100 bg-slate-950 px-6 py-6 text-white sm:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
                    Secure Login
                  </p>
                  <h2 className="text-2xl font-bold">Welcome back</h2>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6 sm:px-8">
              <form onSubmit={handleLogin} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Email or username
                  </span>
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="app-input"
                    placeholder="Enter your account"
                    autoComplete="username"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </span>
                  <div className="relative">
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="app-input pr-12"
                      placeholder="Enter your password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>

                {loginError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {loginError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loadingUsers || loggingIn}
                  className="app-button-primary w-full justify-center"
                >
                  {loadingUsers || loggingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {loadingUsers
                    ? "Loading accounts..."
                    : loggingIn
                      ? "Signing in..."
                      : "Sign in"}
                </button>
              </form>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-950">
                      Forgot password?
                    </h3>
                    <p className="text-xs text-slate-500">
                      Receive a temporary password by email.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={forgotIdentifier}
                      onChange={(event) =>
                        setForgotIdentifier(event.target.value)
                      }
                      className="app-input pl-10"
                      placeholder="Email or username"
                    />
                  </div>

                  {forgotMessage ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                      {forgotMessage}
                    </div>
                  ) : null}

                  {forgotError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {forgotError}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={sendingReset}
                    className="app-button-secondary w-full justify-center"
                  >
                    {sendingReset ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {sendingReset ? "Sending..." : "Send reset email"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
