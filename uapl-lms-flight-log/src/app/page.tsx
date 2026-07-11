"use client";

import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { sessionKey, type UserRole } from "@/lib/demo-auth";
import { fetchGoogleUsers } from "@/lib/google-api";
import { getManagedUsers, saveManagedUsers } from "@/lib/user-storage";
import {
  ArrowRight,
  BadgeCheck,
  Lock,
  Mail,
  Plane,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LoginUser = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  passwordChangedAt?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const { notify } = useAppMessage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rawSession = localStorage.getItem(sessionKey);

    if (!rawSession) return;

    try {
      const session = JSON.parse(rawSession) as {
        role?: UserRole;
        mustChangePassword?: boolean;
      };

      if (session.mustChangePassword) {
        router.replace("/change-password");
      } else if (session.role === "admin") {
        router.replace("/admin");
      } else if (session.role === "trainer") {
        router.replace("/flight-logs");
      }
    } catch {
      localStorage.removeItem(sessionKey);
    }
  }, [router]);

  async function getLoginUsers(): Promise<LoginUser[]> {
    try {
      const googleUsers = await fetchGoogleUsers();
      saveManagedUsers(googleUsers);

      return googleUsers.map((user) => ({
        email: user.email,
        password: user.temporaryPassword,
        name: user.name,
        role: user.role,
        passwordChangedAt: user.passwordChangedAt
      }));
    } catch {
      const localUsers = getManagedUsers();

      return localUsers.map((user) => ({
        email: user.email,
        password: user.temporaryPassword,
        name: user.name,
        role: user.role,
        passwordChangedAt: user.passwordChangedAt
      }));
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      notify({
        type: "warning",
        title: "Email required",
        message: "Enter your account email to continue."
      });
      return;
    }

    if (!password.trim()) {
      notify({
        type: "warning",
        title: "Password required",
        message: "Enter your password to continue."
      });
      return;
    }

    setLoading(true);

    try {
      const users = await getLoginUsers();

      if (!users.length) {
        notify({
          type: "error",
          title: "No accounts found",
          message: "No admin or trainer accounts are available. Please check Google Sheets."
        });
        return;
      }

      const user = users.find(
        (item) =>
          item.email.trim().toLowerCase() === email.trim().toLowerCase() &&
          item.password === password
      );

      if (!user) {
        notify({
          type: "error",
          title: "Login failed",
          message: "Invalid email or password."
        });
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

      notify({
        type: "success",
        title: "Welcome back",
        message: `Signed in as ${user.name}.`
      });

      router.push(
        mustChangePassword
          ? "/change-password"
          : user.role === "admin"
            ? "/admin"
            : "/flight-logs"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-light">
      {loading ? <LoadingOverlay label="Signing in..." /> : null}

      <div className="grid min-h-screen lg:grid-cols-[1fr_520px]">
        <section className="hidden bg-brand-navy px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-brand-navy">
                <Plane size={25} />
              </div>
              <div>
                <p className="text-lg font-bold">UAPL LMS</p>
                <p className="text-sm text-white/65">Flight Log System</p>
              </div>
            </div>

            <div className="mt-20 max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-white/80">
                <Sparkles size={15} />
                Secure trainer flight log workflow
              </div>

              <h1 className="mt-6 text-5xl font-semibold leading-tight">
                Manage student flight logs with a clean, mobile-first system.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-white/70">
                Sign in with your admin-created account to capture records,
                continue student logs, and generate PDF reports.
              </p>
            </div>
          </div>

          <div className="grid max-w-3xl grid-cols-3 gap-3">
            {[
              { label: "Role access", icon: ShieldCheck },
              { label: "PDF reports", icon: BadgeCheck },
              { label: "Mobile ready", icon: Plane }
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-white/10 p-4"
                >
                  <Icon size={20} className="text-brand-gold" />
                  <p className="mt-3 text-sm font-semibold">{item.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy text-white">
                <Plane size={24} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">UAPL LMS</p>
                <p className="text-sm text-slate-500">Flight Log System</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div>
                <p className="text-sm font-semibold uppercase text-brand-gold">
                  Authorized Access
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Sign in to continue
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Use the email and temporary password issued by the administrator.
                </p>
              </div>

              <form onSubmit={handleLogin} className="mt-7 space-y-5">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
                    <Mail size={18} className="text-slate-400" />
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                      placeholder="name@example.com"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Password
                  </span>
                  <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
                    <Lock size={18} className="text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                      placeholder="Enter password"
                    />
                  </div>
                </label>

                <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-navy text-sm font-semibold text-white hover:bg-slate-800">
                  Sign In
                  <ArrowRight size={17} />
                </button>
              </form>
            </div>

            <p className="mt-5 text-center text-xs text-slate-500">
              Optimized for mobile trainers, tablets, laptops, and desktop monitors.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
