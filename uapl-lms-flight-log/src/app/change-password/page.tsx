"use client";

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
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  AuthApiError,
  changePasswordSecurely,
  getSecureSession,
  type SecureSession,
} from "@/lib/auth-api";

type PasswordRule = {
  label: string;
  passed: boolean;
};

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [session, setSession] = useState<SecureSession | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const storedSession = getSecureSession();

    if (!storedSession) {
      setCheckingSession(false);
      router.replace("/");
      return;
    }

    setSession(storedSession);
    setCheckingSession(false);
  }, [router]);

  const passwordRules = useMemo<PasswordRule[]>(
    () => [
      {
        label: "At least 10 characters",
        passed: newPassword.length >= 10,
      },
      {
        label: "One uppercase letter",
        passed: /[A-Z]/.test(newPassword),
      },
      {
        label: "One lowercase letter",
        passed: /[a-z]/.test(newPassword),
      },
      {
        label: "One number",
        passed: /[0-9]/.test(newPassword),
      },
      {
        label: "One special character",
        passed: /[^A-Za-z0-9]/.test(newPassword),
      },
    ],
    [newPassword]
  );

  const passedRuleCount = passwordRules.filter((rule) => rule.passed).length;
  const passwordStrong = passedRuleCount === passwordRules.length;
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;

  function clearMessages() {
    if (error) setError("");
    if (success) setSuccess("");
  }

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (!passwordStrong) {
      setError("Your new password does not meet all security requirements.");
      return;
    }

    if (!passwordsMatch) {
      setError("The new passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("Your new password must be different from your current password.");
      return;
    }

    setSaving(true);

    try {
      const updatedSession = await changePasswordSecurely(
        currentPassword,
        newPassword,
        confirmPassword
      );

      setSession(updatedSession);
      setSuccess("Your password has been changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        router.replace(
          updatedSession.role === "admin" ? "/admin" : "/flight-logs"
        );
      }, 900);
    } catch (caughtError) {
      if (caughtError instanceof AuthApiError) {
        setError(caughtError.message);

        if (caughtError.code === "AUTH_REQUIRED") {
          window.setTimeout(() => router.replace("/"), 1000);
        }
        return;
      }

      setError("Unable to change your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingSession || !session) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f8] px-4">
        <div className="app-panel-enter w-full max-w-sm overflow-hidden rounded-lg border border-[#d7e0ea] bg-white shadow-[0_18px_44px_rgba(16,42,67,0.13)]">
          <div className="grid h-1 grid-cols-[1fr_48px]"><span className="bg-[#075f8f]" /><span className="bg-[#c7353d]" /></div>
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#102a43] text-[#70c8e8]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#16263c]">
                Checking session
              </p>
              <p className="mt-0.5 text-xs text-[#6b7d92]">
                Verifying your secure access...
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#eef3f8] px-4 py-6 sm:px-6 sm:py-10">
      <div className="absolute inset-x-0 top-0 grid h-1 grid-cols-[1fr_72px]"><span className="bg-[#075f8f]" /><span className="bg-[#c7353d]" /></div>

      <section className="app-panel-enter w-full max-w-[560px] overflow-hidden rounded-lg border border-[#d4dee8] bg-white shadow-[0_2px_4px_rgba(16,42,67,0.06),0_24px_60px_rgba(16,42,67,0.14)]">
        <header className="border-b border-[#e1e8ef] px-5 py-7 text-center sm:px-9 sm:py-8">
          <img
            src={LOGO_PATH}
            alt="Apollo Global Academy"
            className="mx-auto h-auto max-h-16 w-auto max-w-[220px] object-contain sm:max-w-[250px]"
          />
          <div className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-lg bg-[#102a43] text-[#70c8e8] shadow-sm">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#16263c]">
            Change your password
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d92]">
            Create a secure password for{" "}
            <span className="break-all font-semibold text-[#405168]">
              {session.email}
            </span>
            .
          </p>
        </header>

        <div className="px-5 py-6 sm:px-9 sm:py-8">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={(value) => {
                setCurrentPassword(value);
                clearMessages();
              }}
              placeholder="Enter your current password"
              visible={showPasswords}
              autoComplete="current-password"
              disabled={saving}
              onCapsLockChange={setCapsLockOn}
              onKeyEvent={updateCapsLock}
            />

            <PasswordField
              label="New password"
              value={newPassword}
              onChange={(value) => {
                setNewPassword(value);
                clearMessages();
              }}
              placeholder="Create a new password"
              visible={showPasswords}
              autoComplete="new-password"
              disabled={saving}
              onCapsLockChange={setCapsLockOn}
              onKeyEvent={updateCapsLock}
            />

            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                clearMessages();
              }}
              placeholder="Enter the new password again"
              visible={showPasswords}
              autoComplete="new-password"
              disabled={saving}
              onCapsLockChange={setCapsLockOn}
              onKeyEvent={updateCapsLock}
            />

            <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowPasswords((current) => !current)}
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#075f8f] transition hover:text-[#064d75] disabled:opacity-50"
              >
                {showPasswords ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {showPasswords ? "Hide passwords" : "Show passwords"}
              </button>

              {capsLockOn ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is on
                </span>
              ) : null}
            </div>

            <section className="rounded-lg border border-[#dbe3ec] bg-[#f7f9fb] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#075f8f]" />
                  <p className="text-xs font-bold uppercase text-[#506278]">
                    Password strength
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#718096]">
                  {passedRuleCount}/{passwordRules.length}
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce5ed]">
                <div
                  className={`h-full rounded-full transition-all ${
                    passwordStrong ? "bg-emerald-500" : "bg-[#1686b1]"
                  }`}
                  style={{
                    width: `${(passedRuleCount / passwordRules.length) * 100}%`,
                  }}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {passwordRules.map((rule) => (
                  <div
                    key={rule.label}
                    className={`flex items-center gap-2 text-xs font-medium ${
                      rule.passed ? "text-emerald-700" : "text-[#718096]"
                    }`}
                  >
                    {rule.passed ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {rule.label}
                  </div>
                ))}
              </div>

              {confirmPassword ? (
                <div
                  className={`mt-3 flex items-center gap-2 border-t border-[#dbe3ec] pt-3 text-xs font-semibold ${
                    passwordsMatch ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {passwordsMatch ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {passwordsMatch
                    ? "Passwords match"
                    : "Passwords do not match"}
                </div>
              ) : null}
            </section>

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

            {success ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-800"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold leading-5">{success}</p>
                  <p className="mt-1 text-xs">Redirecting to your account...</p>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saving || !passwordStrong || !passwordsMatch}
              className="app-button-primary h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              {saving ? "Changing password..." : "Change password"}
            </button>
          </form>
        </div>

        <footer className="border-t border-[#e1e8ef] bg-[#f7f9fb] px-5 py-3 text-center text-xs text-[#718096]">
          Changing your password signs out all previous sessions.
        </footer>
      </section>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  visible,
  autoComplete,
  disabled,
  onCapsLockChange,
  onKeyEvent,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  autoComplete: string;
  disabled: boolean;
  onCapsLockChange: (active: boolean) => void;
  onKeyEvent: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#405168]">
        {label}
      </span>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyEvent}
          onKeyUp={onKeyEvent}
          onBlur={() => onCapsLockChange(false)}
          type={visible ? "text" : "password"}
          className="app-input mt-0 pl-10"
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
        />
      </div>
    </label>
  );
}
