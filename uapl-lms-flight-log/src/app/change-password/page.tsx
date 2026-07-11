"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Check,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  AuthApiError,
  changePasswordSecurely,
  getSecureSession,
  type SecureSession
} from "@/lib/auth-api";

type PasswordRule = {
  label: string;
  passed: boolean;
};

export default function ChangePasswordPage() {
  const router = useRouter();

  const [session, setSession] =
    useState<SecureSession | null>(
      null
    );

  const [
    currentPassword,
    setCurrentPassword
  ] = useState("");

  const [
    newPassword,
    setNewPassword
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword
  ] = useState("");

  const [
    showPasswords,
    setShowPasswords
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [
    checkingSession,
    setCheckingSession
  ] = useState(true);

  useEffect(() => {
    const storedSession =
      getSecureSession();

    if (!storedSession) {
      setCheckingSession(false);
      router.replace("/");
      return;
    }

    setSession(storedSession);
    setCheckingSession(false);
  }, [router]);

  const passwordRules =
    useMemo<PasswordRule[]>(
      () => [
        {
          label:
            "At least 10 characters",
          passed:
            newPassword.length >= 10
        },
        {
          label:
            "One uppercase letter",
          passed:
            /[A-Z]/.test(
              newPassword
            )
        },
        {
          label:
            "One lowercase letter",
          passed:
            /[a-z]/.test(
              newPassword
            )
        },
        {
          label: "One number",
          passed:
            /[0-9]/.test(
              newPassword
            )
        },
        {
          label:
            "One special character",
          passed:
            /[^A-Za-z0-9]/.test(
              newPassword
            )
        }
      ],
      [newPassword]
    );

  const passwordStrong =
    passwordRules.every(
      (rule) => rule.passed
    );

  const passwordsMatch =
    confirmPassword.length > 0 &&
    newPassword ===
      confirmPassword;

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) return;

    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError(
        "Enter your current password."
      );
      return;
    }

    if (!passwordStrong) {
      setError(
        "Your new password does not meet all security requirements."
      );
      return;
    }

    if (!passwordsMatch) {
      setError(
        "The new passwords do not match."
      );
      return;
    }

    if (
      currentPassword ===
      newPassword
    ) {
      setError(
        "Your new password must be different from your current password."
      );
      return;
    }

    setSaving(true);

    try {
      const updatedSession =
        await changePasswordSecurely(
          currentPassword,
          newPassword,
          confirmPassword
        );

      setSession(updatedSession);

      setSuccess(
        "Your password has been changed successfully."
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        router.replace(
          updatedSession.role ===
            "admin"
            ? "/admin"
            : "/flight-logs"
        );
      }, 900);
    } catch (caughtError) {
      if (
        caughtError instanceof
        AuthApiError
      ) {
        setError(
          caughtError.message
        );

        if (
          caughtError.code ===
          "AUTH_REQUIRED"
        ) {
          window.setTimeout(() => {
            router.replace("/");
          }, 1000);
        }

        return;
      }

      setError(
        "Unable to change your password. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  if (
    checkingSession ||
    !session
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6fb] px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xl shadow-slate-200/70">
          <Loader2 className="h-5 w-5 animate-spin text-sky-700" />

          <div>
            <p className="text-sm font-semibold text-slate-950">
              Checking session
            </p>

            <p className="text-xs text-slate-500">
              Verifying your account...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6fb] px-4 py-8 sm:px-6">
      <section className="w-full max-w-lg">
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
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
                <KeyRound className="h-5 w-5" />
              </div>

              <h1 className="mt-4 text-2xl font-bold text-slate-950">
                Change your password
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Create a secure password for{" "}
                <span className="font-semibold text-slate-700">
                  {session.email}
                </span>
                .
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <PasswordField
                label="Current password"
                value={currentPassword}
                onChange={
                  setCurrentPassword
                }
                placeholder="Enter your current password"
                visible={showPasswords}
                autoComplete="current-password"
                disabled={saving}
              />

              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Create a new password"
                visible={showPasswords}
                autoComplete="new-password"
                disabled={saving}
              />

              <PasswordField
                label="Confirm new password"
                value={confirmPassword}
                onChange={
                  setConfirmPassword
                }
                placeholder="Enter the new password again"
                visible={showPasswords}
                autoComplete="new-password"
                disabled={saving}
              />

              <button
                type="button"
                onClick={() =>
                  setShowPasswords(
                    (current) =>
                      !current
                  )
                }
                className="flex items-center gap-2 text-sm font-semibold text-sky-700 transition hover:text-sky-900"
              >
                {showPasswords ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}

                {showPasswords
                  ? "Hide passwords"
                  : "Show passwords"}
              </button>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase text-slate-500">
                  Password requirements
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {passwordRules.map(
                    (rule) => (
                      <div
                        key={rule.label}
                        className={`flex items-center gap-2 text-xs font-medium ${
                          rule.passed
                            ? "text-emerald-700"
                            : "text-slate-500"
                        }`}
                      >
                        {rule.passed ? (
                          <Check className="h-4 w-4 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0" />
                        )}

                        {rule.label}
                      </div>
                    )
                  )}
                </div>

                {confirmPassword ? (
                  <div
                    className={`mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs font-medium ${
                      passwordsMatch
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {passwordsMatch ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}

                    {passwordsMatch
                      ? "Passwords match"
                      : "Passwords do not match"}
                  </div>
                ) : null}
              </div>

              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700"
                >
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-700"
                >
                  {success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  saving ||
                  !passwordStrong ||
                  !passwordsMatch
                }
                className="app-button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}

                {saving
                  ? "Changing password..."
                  : "Change password"}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Changing your password signs out
          all previous sessions.
        </p>
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
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  autoComplete: string;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>

      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        type={
          visible
            ? "text"
            : "password"
        }
        className="app-input"
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        required
      />
    </label>
  );
}
