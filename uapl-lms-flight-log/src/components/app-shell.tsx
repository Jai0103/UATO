"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  ClipboardList,
  Database,
  FileText,
  Loader2,
  LogOut,
  Menu,
  Shield,
  UserCircle,
  UserCog,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  sessionKey,
  type UserRole
} from "@/lib/demo-auth";

type Session = {
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword?: boolean;
};

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
};

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";
const PASSWORD_PAGE = "/change-password";

const adminOnlyPages = [
  "/admin",
  "/master-data",
  "/users"
];

const adminLinks: NavigationItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: BarChart3
  },
  {
    href: "/flight-logs",
    label: "Flight Logs",
    icon: ClipboardList
  },
  {
    href: "/records",
    label: "Records",
    icon: Archive
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText
  },
  {
    href: "/master-data",
    label: "Master Data",
    icon: Database
  },
  {
    href: "/users",
    label: "Users",
    icon: UserCog
  }
];

const trainerLinks: NavigationItem[] = [
  {
    href: "/flight-logs",
    label: "Flight Logs",
    icon: ClipboardList
  },
  {
    href: "/records",
    label: "Records",
    icon: Archive
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText
  }
];

function BrandLogo({
  mobile = false
}: {
  mobile?: boolean;
}) {
  return (
    <div
      className={
        mobile
          ? "flex min-w-0 items-center gap-3"
          : "flex min-w-0 items-center gap-3"
      }
    >
      <img
        src={LOGO_PATH}
        alt="Apollo Global Academy"
        className={
          mobile
            ? "max-h-10 w-auto max-w-[118px] shrink-0 object-contain"
            : "max-h-12 w-auto max-w-[120px] shrink-0 object-contain"
        }
        onError={(event) => {
          const image = event.currentTarget;

          if (!image.src.endsWith("/AGA_Logo_fullcolor_Horizontal%20(1).png")) {
            image.src = "/aga-logo-horizontal.png";
          }
        }}
      />

      <div className="min-w-0 border-l border-slate-200 pl-3">
        <p
          className={
            mobile
              ? "text-xs font-bold leading-4 text-slate-950"
              : "text-sm font-bold leading-5 text-slate-950"
          }
        >
          Flight Management
          <span className="block">System</span>
        </p>
      </div>
    </div>
  );
}

export function AppShell({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [session, setSession] =
    useState<Session | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const [checkingSession, setCheckingSession] =
    useState(true);

  useEffect(() => {
    function checkSession() {
      const rawSession =
        localStorage.getItem(sessionKey);

      if (!rawSession) {
        router.replace("/");
        return;
      }

      try {
        const parsedSession =
          JSON.parse(rawSession) as Session;

        if (
          parsedSession.mustChangePassword &&
          pathname !== PASSWORD_PAGE
        ) {
          router.replace(PASSWORD_PAGE);
          return;
        }

        const isAdminOnlyPage =
          adminOnlyPages.some((page) =>
            pathname.startsWith(page)
          );

        if (
          parsedSession.role !== "admin" &&
          isAdminOnlyPage
        ) {
          router.replace("/flight-logs");
          return;
        }

        setSession(parsedSession);
      } catch {
        localStorage.removeItem(sessionKey);
        router.replace("/");
      } finally {
        setCheckingSession(false);
      }
    }

    checkSession();
  }, [pathname, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  function logout() {
    localStorage.removeItem(sessionKey);
    setMobileMenuOpen(false);
    router.replace("/");
  }

  if (checkingSession || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f6fb] px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-lg shadow-slate-200/60">
          <Loader2 className="h-5 w-5 animate-spin text-sky-700" />

          <div>
            <p className="text-sm font-semibold text-slate-900">
              Loading workspace
            </p>
            <p className="text-xs text-slate-500">
              Checking your account access...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const links =
    session.role === "admin"
      ? adminLinks
      : trainerLinks;

  const navigation = (
    <>
      <div className="mb-5 border-b border-slate-100 px-1 pb-5">
        <BrandLogo />
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-sky-800 shadow-sm ring-1 ring-slate-200">
            {session.role === "admin" ? (
              <Shield className="h-5 w-5" />
            ) : (
              <UserCircle className="h-5 w-5" />
            )}
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

          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() =>
                setMobileMenuOpen(false)
              }
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                active
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  active
                    ? "text-sky-300"
                    : "text-slate-500"
                }`}
              />

              <span className="truncate">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={logout}
          className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#f3f6fb]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex h-[68px] items-center justify-between gap-3 px-4">
          <BrandLogo mobile />

          <button
            type="button"
            onClick={() =>
              setMobileMenuOpen(true)
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() =>
              setMobileMenuOpen(false)
            }
            aria-label="Close navigation menu"
          />

          <aside className="absolute left-0 top-0 flex h-full w-[88vw] max-w-[340px] flex-col overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setMobileMenuOpen(false)
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {navigation}
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col overflow-y-auto border-r border-slate-200 bg-white p-5 md:flex">
        {navigation}
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 md:ml-[280px] md:px-7 md:py-7 lg:px-8">
        <div className="mx-auto w-full min-w-0 max-w-[1600px]">
          {children}
        </div>
      </main>
    </div>
  );
}
