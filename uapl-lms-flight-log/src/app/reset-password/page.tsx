"use client";

import { FirebaseError } from "firebase/app";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { firebaseAuth } from "@/lib/firebase-client";

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";

type PageState = "checking" | "ready" | "complete" | "invalid";

function firebaseMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "The password could not be updated. Please try again.";
  }

  if (
    error.code === "auth/expired-action-code" ||
    error.code === "auth/invalid-action-code"
  ) {
    return "This reset link is invalid or has expired. Request a new link to continue.";
  }

  if (error.code === "auth/weak-password") {
    return "Choose a stronger password that meets every requirement below.";
  }

  return "The password could not be updated. Please request a new reset link.";
}

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("checking");
  const [actionCode, setActionCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const mode = parameters.get("mode");
    const code = parameters.get("oobCode") || "";

    if (mode !== "resetPassword" || !code) {
      setError("This password reset link is incomplete or invalid.");
      setPageState("invalid");
      return;
    }

    let active = true;
    verifyPasswordResetCode(firebaseAuth, code)
      .then((verifiedEmail) => {
        if (!active) return;
        setActionCode(code);
        setEmail(verifiedEmail);
        setPageState("ready");
      })
      .catch((caughtError) => {
        if (!active) return;
        setError(firebaseMessage(caughtError));
        setPageState("invalid");
      });

    return () => {
      active = false;
    };
  }, []);

  const rules = useMemo(
    () => [
      { label: "At least 10 characters", passed: password.length >= 10 },
      { label: "One uppercase letter", passed: /[A-Z]/.test(password) },
      { label: "One lowercase letter", passed: /[a-z]/.test(password) },
      { label: "One number", passed: /[0-9]/.test(password) },
      {
        label: "One special character",
        passed: /[^A-Za-z0-9]/.test(password),
      },
    ],
    [password]
  );
  const passwordStrong = rules.every((rule) => rule.passed);
  const passwordsMatch = confirmation.length > 0 && password === confirmation;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !actionCode) return;

    setError("");
    if (!passwordStrong) {
      setError("Your new password does not meet all security requirements.");
      return;
    }
    if (!passwordsMatch) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await confirmPasswordReset(firebaseAuth, actionCode, password);
      setPassword("");
      setConfirmation("");
      setPageState("complete");
    } catch (caughtError) {
      setError(firebaseMessage(caughtError));
      if (
        caughtError instanceof FirebaseError &&
        ["auth/expired-action-code", "auth/invalid-action-code"].includes(
          caughtError.code
        )
      ) {
        setPageState("invalid");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#eef3f8] px-4 py-6 sm:px-6 sm:py-10">
      <div className="absolute inset-x-0 top-0 grid h-1 grid-cols-[1fr_72px]">
        <span className="bg-[#075f8f]" />
        <span className="bg-[#c7353d]" />
      </div>

      <section className="app-panel-enter w-full max-w-[520px] overflow-hidden rounded-lg border border-[#d4dee8] bg-white shadow-[0_2px_4px_rgba(16,42,67,0.06),0_24px_60px_rgba(16,42,67,0.14)]">
        <header className="border-b border-[#e1e8ef] px-5 py-7 text-center sm:px-9 sm:py-8">
          <img
            src={LOGO_PATH}
            alt="Apollo Global Academy"
            className="mx-auto h-auto max-h-20 w-auto max-w-[238px] object-contain sm:max-w-[268px]"
          />
          <div className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-lg bg-[#102a43] text-[#70c8e8] shadow-sm">
            {pageState === "complete" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : pageState === "checking" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <KeyRound className="h-5 w-5" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#16263c]">
            {pageState === "checking"
              ? "Verifying reset link"
              : pageState === "complete"
                ? "Password updated"
                : pageState === "invalid"
                  ? "Reset link unavailable"
                  : "Create a new password"}
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d92]">
            {pageState === "ready"
              ? `Secure your account for ${email}.`
              : pageState === "complete"
                ? "Your Firebase account is ready with the new password."
                : pageState === "invalid"
                  ? "For your security, password reset links can only be used once and may expire."
                  : "Checking that this secure Firebase link is valid..."}
          </p>
        </header>

        <div className="px-5 py-6 sm:px-9 sm:py-8">
          {pageState === "checking" ? (
            <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-900">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-700" />
              Verifying your secure link...
            </div>
          ) : null}

          {pageState === "ready" ? (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <PasswordInput
                label="New password"
                value={password}
                visible={showPassword}
                onChange={(value) => {
                  setPassword(value);
                  setError("");
                }}
              />
              <PasswordInput
                label="Confirm new password"
                value={confirmation}
                visible={showPassword}
                onChange={(value) => {
                  setConfirmation(value);
                  setError("");
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="flex min-h-10 items-center gap-2 text-sm font-semibold text-[#075f8f] hover:underline"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                {showPassword ? "Hide passwords" : "Show passwords"}
              </button>

              <div className="rounded-lg border border-[#dbe4ed] bg-[#f7f9fb] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#405168]">
                  <ShieldBadge /> Password requirements
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {rules.map((rule) => (
                    <div
                      key={rule.label}
                      className={`flex items-center gap-2 text-xs font-medium ${
                        rule.passed ? "text-emerald-700" : "text-[#6b7d92]"
                      }`}
                    >
                      {rule.passed ? <Check size={15} /> : <Circle size={15} />}
                      {rule.label}
                    </div>
                  ))}
                </div>
                {confirmation ? (
                  <p
                    className={`mt-3 flex items-center gap-2 text-xs font-semibold ${
                      passwordsMatch ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {passwordsMatch ? <Check size={15} /> : <AlertCircle size={15} />}
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </p>
                ) : null}
              </div>

              {error ? <ErrorNotice message={error} /> : null}

              <button
                type="submit"
                disabled={saving || !passwordStrong || !passwordsMatch}
                className="app-button-primary h-12 w-full justify-center"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LockKeyhole className="h-4 w-4" />
                )}
                {saving ? "Updating password..." : "Update password"}
              </button>
            </form>
          ) : null}

          {pageState === "invalid" ? (
            <div className="space-y-4">
              <ErrorNotice message={error} />
              <a
                href="/UATO/forgot-password/"
                className="app-button-primary flex h-12 w-full items-center justify-center"
              >
                Request a new reset link
              </a>
              <a
                href="/UATO/"
                className="app-button-secondary flex h-12 w-full items-center justify-center"
              >
                Return to sign in
              </a>
            </div>
          ) : null}

          {pageState === "complete" ? (
            <div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">Password changed successfully</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700">
                      You can now sign in with your new password.
                    </p>
                  </div>
                </div>
              </div>
              <a
                href="/UATO/"
                className="app-button-primary mt-5 flex h-12 w-full items-center justify-center"
              >
                Continue to sign in
              </a>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-[#e1e8ef] bg-[#f7f9fb] px-5 py-3 text-center text-xs text-[#718096]">
          Secure account recovery powered by Firebase Authentication
        </footer>
      </section>
    </main>
  );
}

function PasswordInput({
  label,
  value,
  visible,
  onChange,
}: {
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#405168]">{label}</span>
      <div className="relative">
        <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" />
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="app-input mt-0 pl-10"
          placeholder="Enter a secure password"
          autoComplete="new-password"
        />
      </div>
    </label>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-rose-800"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      <p className="break-words text-sm font-semibold leading-5">{message}</p>
    </div>
  );
}

function ShieldBadge() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#102a43] text-[#70c8e8]">
      <LockKeyhole size={14} />
    </span>
  );
}
