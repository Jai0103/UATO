"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ClipboardList, LogOut, Plane, Users } from "lucide-react";
import { sessionKey, type UserRole } from "@/lib/demo-auth";
import { useEffect, useState } from "react";

type Session = {
  name: string;
  email: string;
  role: UserRole;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const rawSession = localStorage.getItem(sessionKey);

    if (!rawSession) {
      router.replace("/");
      return;
    }

    setSession(JSON.parse(rawSession) as Session);
  }, [router]);

  function logout() {
    localStorage.removeItem(sessionKey);
    router.replace("/");
  }

  if (!session) {
    return null;
  }

  const links =
    session.role === "admin"
      ? [
          { href: "/admin", label: "Dashboard", icon: BarChart3 },
          { href: "/flight-logs", label: "Flight Logs", icon: ClipboardList }
        ]
      : [{ href: "/flight-logs", label: "Flight Logs", icon: ClipboardList }];

  return (
    <div className="min-h-screen bg-brand-light">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-navy text-white">
              <Plane size={21} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">UAPL LMS</p>
              <p className="text-xs text-slate-500">Flight Log System</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-4 rounded-md bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-950">{session.name}</p>
            <p className="text-xs capitalize text-slate-500">{session.role}</p>
          </div>

          <nav className="space-y-1">
            {links.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                    active
                      ? "bg-brand-navy text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

       <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
