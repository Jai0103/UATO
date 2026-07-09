"use client";

import { useRouter } from "next/navigation";
import { Lock, Plane } from "lucide-react";
import { FormEvent, useState } from "react";
import { demoUsers, sessionKey } from "@/lib/demo-auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@uapl.local");
  const [password, setPassword] = useState("Admin@1234");
  const [error, setError] = useState("");

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const user = demoUsers.find(
      (item) => item.email === email && item.password === password
    );

    if (!user) {
      setError("Invalid username or password.");
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

    router.push(user.role === "admin" ? "/admin" : "/flight-logs");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-light px-4 py-10">
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
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-navy text-sm font-semibold text-white hover:bg-slate-800">
            <Lock size={17} />
            Sign In
          </button>
        </form>

        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p>Admin: admin@uapl.local / Admin@1234</p>
          <p className="mt-1">Trainer: trainer@uapl.local / Trainer@1234</p>
        </div>
      </section>
    </main>
  );
}
