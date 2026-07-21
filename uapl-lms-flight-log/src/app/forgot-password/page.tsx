"use client";

import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  CheckCircle2,
  Loader2,
  Mail,
  MailCheck,
  ShieldQuestion,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwjmTFIGbGSHhaxj9ds86l5_Vgx6vuovgQZpfNRSexZH5T336eLEylJiWoKaPkAkHnZPg/exec";

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [submittedIdentifier, setSubmittedIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    setMessage("");
    setError("");

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier) {
      setError("Enter your email or username.");
      return;
    }

    setSending(true);

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "forgotPassword",
          identifier: cleanIdentifier,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to reach the reset service.");
      }

      const result = (await response.json()) as {
        success?: boolean;
        ok?: boolean;
        message?: string;
      };
      const succeeded = result.success ?? result.ok;

      if (!succeeded) {
        setError(result.message || "Password reset failed.");
        return;
      }

      setSubmittedIdentifier(cleanIdentifier);
      setMessage(
        result.message ||
          "A temporary password has been sent to your registered email."
      );
      setIdentifier("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "Unable to send the reset email. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  function resetForm() {
    setMessage("");
    setError("");
    setSubmittedIdentifier("");
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
          <div className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
            {message ? (
              <MailCheck className="h-5 w-5" />
            ) : (
              <ShieldQuestion className="h-5 w-5" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-950">
            {message ? "Check your email" : "Forgot password?"}
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            {message
              ? "Use the temporary password in the email to sign in."
              : "Enter your registered email or username to request a temporary password."}
          </p>
        </header>

        <div className="px-5 py-6 sm:px-8 sm:py-7">
          {message ? (
            <div>
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5">{message}</p>
                    {submittedIdentifier ? (
                      <p className="mt-1 break-all text-xs leading-5 text-emerald-700">
                        Request submitted for {submittedIdentifier}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push("/")}
                className="app-button-primary mt-5 h-12 w-full justify-center"
              >
                <ArrowLeft className="h-4 w-4" /> Return to sign in
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="app-button-secondary mt-3 h-12 w-full justify-center"
              >
                <Mail className="h-4 w-4" /> Send another reset
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                        if (error) setError("");
                      }}
                      className="app-input mt-0 pl-10"
                      placeholder="Enter your account"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={sending}
                      aria-invalid={Boolean(error)}
                      autoFocus
                    />
                  </div>
                </label>

                {error ? (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-rose-800"
                  >
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                    <p className="break-words text-sm font-semibold leading-5">
                      {error}
                    </p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={sending}
                  className="app-button-primary h-12 w-full justify-center"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {sending ? "Sending reset email..." : "Send temporary password"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => router.push("/")}
                disabled={sending}
                className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-900 hover:underline disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" /> Sign in
              </button>
            </>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-xs text-slate-500">
          Apollo Global Academy
        </footer>
      </section>
    </main>
  );
}
