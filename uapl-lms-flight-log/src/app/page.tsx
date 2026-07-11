"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plane
} from "lucide-react";
import { useRouter } from "next/navigation";
import { sessionKey } from "@/lib/demo-auth";
import {
  getManagedUsers,
  type ManagedUser
} from "@/lib/user-storage";
import { fetchGoogleUsers } from "@/lib/google-api";

export default function LoginPage() {
  const router = useRouter();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    async function loadUsers() {
      try {
        const googleUsers = await fetchGoogleUsers();

        if (googleUsers.length > 0) {
          setUsers(googleUsers);
          return;
        }

        setUsers(getManagedUsers());
      } catch {
        setUsers(getManagedUsers());
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

    if (!cleanIdentifier || !cleanPassword) {
      setLoginError("Enter your email or username and password.");
      setLoggingIn(false);
      return;
    }

    const user = users.find((item) => {
      const nameMatches =
        item.name.trim().toLowerCase() === cleanIdentifier;

      const emailMatches =
        item.email.trim().toLowerCase() === cleanIdentifier;

      const passwordMatches =
        item.temporaryPassword === cleanPassword;

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
        mustChangePassword
      })
    );

    if (mustChangePassword) {
      router.push("/change-password");
      return;
    }

    router.push(
      user.role === "admin" ? "/admin" : "/flight-logs"
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f6fb] px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-48px)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden lg:block">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <Plane className="h-4 w-4 text-sky-600" />
            UAPL LMS Flight Operations
          </div>

          <h1 className="max-w-xl text-5xl font-bold tracking-tight text-slate-950">
            Professional flight log management for trainers and
            administrators.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Record student flights, manage operational data, generate
            reports, and keep training records organized across mobile,
            tablet, laptop, and desktop.
          </p>

          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {[
              "Flight Logs",
              "Reports",
              "Admin Control"
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <div className="flex justify-center border-b border-slate-100 bg-white px-6 py-7 sm:px-8">
              <img
                src="./AGA_Logo_fullcolor_Horizontal (1).png"
                alt="Apollo Global Academy"
                className="h-auto max-h-24 w-auto max-w-[240px] object-contain sm:max-w-[280px]"
              />
            </div>

            <div className="px-6 py-7 sm:px-8">
              <form
                onSubmit={handleLogin}
                className="space-y-5"
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Email or username
                  </span>

                  <input
                    value={identifier}
                    onChange={(event) =>
                      setIdentifier(event.target.value)
                    }
                    className="app-input"
                    placeholder="Enter your account"
                    autoComplete="username"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </span>

                  <div className="relative">
                    <input
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      className="app-input pr-12"
                      placeholder="Enter your password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((value) => !value)
                      }
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      router.push("/forgot-password")
                    }
                    className="text-sm font-semibold text-sky-700 transition hover:text-sky-900 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                {loginError ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
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
            </div>
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            Authorized access only
          </p>
        </div>
      </section>
    </main>
  );
}
