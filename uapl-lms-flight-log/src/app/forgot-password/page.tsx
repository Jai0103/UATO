"use client";

import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Mail
} from "lucide-react";
import { useRouter } from "next/navigation";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwjmTFIGbGSHhaxj9ds86l5_Vgx6vuovgQZpfNRSexZH5T336eLEylJiWoKaPkAkHnZPg/exec";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

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
          identifier: cleanIdentifier
        })
      });

      if (!response.ok) {
        throw new Error("Unable to reach the reset service.");
      }

      const result = await response.json();
      const succeeded = result.success ?? result.ok;

      if (!succeeded) {
        setError(
          result.message || "Password reset failed."
        );
        return;
      }

      setMessage(
        result.message ||
          "A temporary password has been sent to your email."
      );

      setIdentifier("");
    } catch {
      setError(
        "Unable to send the reset email. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6fb] px-4 py-8 sm:px-6">
      <section className="w-full max-w-md">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <div className="flex justify-center border-b border-slate-100 px-6 py-7 sm:px-8">
            <img
              src="../apollo-global-academy-logo.png"
              alt="Apollo Global Academy"
              className="h-auto max-h-24 w-auto max-w-[240px] object-contain sm:max-w-[280px]"
            />
          </div>

          <div className="px-6 py-7 sm:px-8">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-slate-950">
                Forgot password?
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter your registered email or username. A
                temporary password will be sent to your email.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Email or username
                </span>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <input
                    value={identifier}
                    onChange={(event) =>
                      setIdentifier(event.target.value)
                    }
                    className="app-input pl-10"
                    placeholder="Enter your account"
                    autoComplete="username"
                    required
                  />
                </div>
              </label>

              {message ? (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-700"
                >
                  {message}
                </div>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={sending}
                className="app-button-primary w-full justify-center"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}

                {sending
                  ? "Sending..."
                  : "Send temporary password"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-900 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Sign in
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
