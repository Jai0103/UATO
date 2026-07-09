"use client";

import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { demoUsers, sessionKey, type UserRole } from "@/lib/demo-auth";
import { fetchGoogleUsers } from "@/lib/google-api";
import { getManagedUsers, saveManagedUsers } from "@/lib/user-storage";
import { Lock, Plane } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginUser = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
};

export default function LoginPage() {
  const router = useRouter();
  const { notify } = useAppMessage();

  const [email, setEmail] = useState("admin@uapl.local");
  const [password, setPassword] = useState("Admin@1234");
  const [loading, setLoading] = useState(false);

  async function getLoginUsers(): Promise<LoginUser[]> {
    const demoLoginUsers: LoginUser[] = demoUsers.map((user) => ({
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role
    }));

    try {
      const googleUsers = await fetchGoogleUsers();
      saveManagedUsers(googleUsers);

      const managedLoginUsers: LoginUser[] = googleUsers.map((user) => ({
        email: user.email,
        password: user.temporaryPassword,
        name: user.name,
        role: user.role
      }));

      return [...managedLoginUsers, ...demoLoginUsers];
    } catch {
      const localUsers = getManagedUsers();

      const localLoginUsers: LoginUser[] = localUsers.map((user) => ({
        email: user.email,
        password: user.temporaryPassword,
        name: user.name,
        role: user.role
      }));

      return [...localLoginUsers, ...demoLoginUsers];
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const users = await getLoginUsers();

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

      localStorage.setItem(
        sessionKey,
        JSON.stringify({
          name: user.name,
          email: user.email,
          role: user.role
        })
      );

      notify({
        type: "success",
        title: "Login successful",
        message: `Welcome, ${user.name}.`
      });

      router.push(user.role === "admin" ? "/admin" : "/flight-logs");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-light px-4 py-10">
      {loading ? <LoadingOverlay label="Signing in..." /> : null}

      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-brand-navy text-white">
            <Plane size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">UAPL LMS</h1>
            <p className="text-sm text-slate-500">Flight Log Management System</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
              placeholder="Enter email"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
              placeholder="Enter password"
            />
          </label>

          <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-navy text-sm font-semibold text-white hover:bg-slate-800">
            <Lock size={17} />
            Sign In
          </button>
        </form>

        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Demo access</p>
          <p className="mt-2">Admin: admin@uapl.local / Admin@1234</p>
          <p className="mt-1">Trainer: trainer@uapl.local / Trainer@1234</p>
        </div>
      </section>
    </main>
  );
}
