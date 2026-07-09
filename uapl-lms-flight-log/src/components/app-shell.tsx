"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Database,
  FileText,
  LogOut,
  Menu,
  Plane,
  Shield,
  UserCircle,
  Archive,
  X
} from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const rawSession = localStorage.getItem(sessionKey);

    if (!rawSession) {
      router.replace("/");
      return;
    }

    const parsedSession = JSON.parse(rawSession) as Session;
    const adminOnlyPages = ["/admin", "/master-data"];

    if (parsedSession.role === "trainer" && adminOnlyPages.includes(pathname)) {
      router.replace("/flight-logs");
      return;
    }

    setSession(parsedSession);
  }, [pathname, router]);

  function logout() {
    localStorage.removeItem(sessionKey);
    router.replace("/");
  }

  if (!session) return null;

  const links =
     session.role === "admin"
    ? [
        { href: "/admin", label: "Dashboard", icon: BarChart3 },
        { href: "/flight-logs", label: "Flight Logs", icon: ClipboardList },
        { href: "/records", label: "Records", icon: Archive },
        { href: "/reports", label: "Reports", icon: FileText },
        { href: "/master-data", label: "Master Data", icon: Database }
      ]
    : [
        { href: "/flight-logs", label: "Flight Logs", icon: ClipboardList },
        { href: "/records", label: "Records", icon: Archive },
        { href: "/reports", label: "Reports", icon: FileText }
      ];

  const navigation = (
    <>
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white shadow-sm">
          <Plane size={22} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide text-slate-950">
            UAPL LMS
          </p>
          <p className="truncate text-xs text-slate-500">Flight Log System</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-brand-navy shadow-sm">
            {session.role === "admin" ? <Shield size={18} /> : <UserCircle size={19} />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">
              {session.name}
            </p>
            <p className="truncate text-xs capitalize text-slate-500">
              {session.role}
            </p>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {links.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                active
                  ? "bg-brand-navy text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <button
          onClick={logout}
          className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-brand-light">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-navy text-white">
              <Plane size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-950">UAPL LMS</p>
              <p className="text-xs text-slate-500">Flight Log System</p>
            </div>
          </div>

          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu overlay"
          />

          <aside className="absolute left-0 top-0 flex h-full w-[82vw] max-w-sm flex-col bg-white p-4 shadow-2xl">
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {navigation}
          </aside>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1440px] gap-0 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200 bg-white p-5 md:flex">
          {navigation}
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
