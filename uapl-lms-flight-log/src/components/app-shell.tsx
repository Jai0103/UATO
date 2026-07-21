"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  History,
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
  getSecureSession,
  isSessionExpired,
  logoutSecurely,
  type SecureSession,
  verifySecureSession
} from "@/lib/auth-api";

type NavigationChild = {
  href: string;
  label: string;
  exact?: boolean;
};

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  exact?: boolean;
  children?: NavigationChild[];
};

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";
const PASSWORD_PAGE = "/change-password";

const adminOnlyPages = [
  "/admin",
  "/approvals",
  "/master-data",
  "/users",
  "/audit-history",
  "/staff-training",
  "/ua-maintenance",
  "/inventory"
];

const adminLinks: NavigationItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: BarChart3
  },
  {
    href: "/approvals",
    label: "AGA Approvals",
    icon: Shield
  },
  {
    href: "/operations",
    label: "Operations",
    icon: ClipboardList,
    children: [
      { href: "/flight-logs", label: "Flight Logs", exact: true },
      { href: "/staff-training", label: "Staff Training", exact: true },
      { href: "/ua-maintenance", label: "UA Maintenance", exact: true },
      { href: "/inventory", label: "Inventory", exact: true }
    ]
  },
  {
    href: "/records",
    label: "Records",
    icon: Archive,
    children: [
      { href: "/records", label: "Flight Log Records", exact: true },
      {
        href: "/staff-training/records",
        label: "Staff Training Records",
        exact: true
      },
      {
        href: "/ua-maintenance/records",
        label: "UA Maintenance Records",
        exact: true
      },
      {
        href: "/inventory/records",
        label: "Inventory Activity",
        exact: true
      }
    ]
  },
  {
    href: "/master-data",
    label: "Master Data",
    icon: Database,
    children: [
      { href: "/master-data", label: "Flight Log Data", exact: true },
      {
        href: "/staff-training/master-data",
        label: "Staff Training Data",
        exact: true
      },
      {
        href: "/ua-maintenance/master-data",
        label: "UA Maintenance Data",
        exact: true
      },
      {
        href: "/inventory/master-data",
        label: "Inventory Data",
        exact: true
      }
    ]
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText
  },
  {
    href: "/users",
    label: "Users",
    icon: UserCog
  },
  {
    href: "/audit-history",
    label: "Audit History",
    icon: History
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

function pathMatches(pathname: string, href: string, exact = false) {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function BrandLogo({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={LOGO_PATH}
        alt="Apollo Global Academy"
        className={
          mobile
            ? "max-h-9 w-auto max-w-[112px] shrink-0 object-contain"
            : "max-h-12 w-auto max-w-[126px] shrink-0 object-contain"
        }
      />
      <div className="min-w-0 border-l border-[#cdd8e4] pl-3">
        <p
          className={
            mobile
              ? "text-xs font-bold leading-4 text-[#16263c]"
              : "text-sm font-bold leading-5 text-[#16263c]"
          }
        >
          Flight Management
          <span className="block">System</span>
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SecureSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    let active = true;

    async function initializeSession() {
      const storedSession = getSecureSession();
      if (!storedSession) {
        if (active) setCheckingSession(false);
        router.replace("/");
        return;
      }

      try {
        const verified = await verifySecureSession(storedSession);
        if (!active) return;
        setSession(verified);
        setCheckingSession(false);
      } catch {
        if (!active) return;
        setSession(null);
        setCheckingSession(false);
        router.replace("/");
      }
    }

    void initializeSession();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;

    if (session.mustChangePassword && pathname !== PASSWORD_PAGE) {
      router.replace(PASSWORD_PAGE);
      return;
    }

    const adminOnly = adminOnlyPages.some((page) =>
      pathname.startsWith(page)
    );
    if (session.role !== "admin" && adminOnly) {
      router.replace("/flight-logs");
    }
  }, [pathname, router, session]);

  useEffect(() => {
    if (!session) return;

    const checkExpiration = () => {
      if (!isSessionExpired(session)) return;
      setSession(null);
      router.replace("/");
    };

    checkExpiration();
    const interval = window.setInterval(checkExpiration, 60_000);
    return () => window.clearInterval(interval);
  }, [router, session]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    const verifyWithServer = async () => {
      const storedSession = getSecureSession();
      if (!storedSession) {
        if (active) {
          setSession(null);
          router.replace("/");
        }
        return;
      }

      try {
        const verified = await verifySecureSession(storedSession);
        if (active) setSession(verified);
      } catch {
        if (active) {
          setSession(null);
          router.replace("/");
        }
      }
    };

    const interval = window.setInterval(verifyWithServer, 5 * 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void verifyWithServer();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, session]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    adminLinks.forEach((item) => {
      const childActive = item.children?.some((child) =>
        pathMatches(pathname, child.href, child.exact)
      );
      if (childActive) {
        setExpandedGroups((current) => ({
          ...current,
          [item.href]: true
        }));
      }
    });
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

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setMobileMenuOpen(false);
    await logoutSecurely();
    setSession(null);
    router.replace("/");
  }

  if (checkingSession || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4">
        <div className="app-panel-enter flex items-center gap-3 rounded-lg border border-[#d7e0ea] bg-white px-5 py-4 shadow-[0_16px_40px_rgba(16,42,67,0.12)]">
          <Loader2 className="h-5 w-5 animate-spin text-[#075f8f]" />
          <div>
            <p className="text-sm font-semibold text-[#16263c]">
              Verifying session
            </p>
            <p className="text-xs text-[#6b7d92]">
              Checking your secure access...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const links = session.role === "admin" ? adminLinks : trainerLinks;

  const navigation = (
    <>
      <div className="relative mb-5 border-b border-[#dce4ed] px-1 pb-5">
        <BrandLogo />
        <span className="absolute -bottom-px left-1 h-0.5 w-10 bg-[#c7353d]" />
      </div>

      <div className="mb-5 rounded-lg border border-[#d9e2eb] bg-[#f5f8fb] p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#075f8f] shadow-sm ring-1 ring-[#d7e0ea]">
            {session.role === "admin" ? (
              <Shield className="h-5 w-5" />
            ) : (
              <UserCircle className="h-5 w-5" />
            )}
            <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#16263c]">
              {session.name}
            </p>
            <p className="truncate text-xs capitalize text-[#718096]">
              {session.role} account
            </p>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {links.map((item) => {
          const Icon = item.icon;
          const childActive = Boolean(
            item.children?.some((child) =>
              pathMatches(pathname, child.href, child.exact)
            )
          );
          const active = item.children
            ? childActive
            : pathMatches(pathname, item.href, item.exact);

          if (item.children) {
            const expanded = expandedGroups[item.href] ?? childActive;
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [item.href]: !(current[item.href] ?? childActive)
                    }))
                  }
                  className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                    active
                      ? "bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.18)]"
                      : "text-[#506278] hover:bg-[#edf3f7] hover:text-[#16263c]"
                  }`}
                  aria-expanded={expanded}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      active ? "text-[#6bc4e8]" : "text-[#708399]"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {item.label}
                  </span>
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                </button>

                {expanded ? (
                  <div className="ml-5 mt-1 space-y-1 border-l border-[#d6e0e9] pl-3">
                    {item.children.map((child) => {
                      const selected = pathMatches(
                        pathname,
                        child.href,
                        child.exact
                      );
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                            selected
                              ? "bg-[#eaf4f8] font-semibold text-[#075f8f] ring-1 ring-inset ring-[#d2e9f2]"
                              : "text-[#66798f] hover:bg-[#f0f4f8] hover:text-[#16263c]"
                          }`}
                          aria-current={selected ? "page" : undefined}
                        >
                          <span className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${selected ? "bg-[#c7353d]" : "bg-[#bdc9d6]"}`} />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                active
                  ? "bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.18)]"
                  : "text-[#506278] hover:bg-[#edf3f7] hover:text-[#16263c]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  active ? "text-[#6bc4e8]" : "text-[#708399]"
                }`}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[#e3e9f0] pt-4">
        <button
          type="button"
          onClick={logout}
          disabled={signingOut}
          className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#5f7187] transition hover:bg-red-50 hover:text-[#b4232d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <LogOut className="h-[18px] w-[18px]" />
          )}
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#eef3f8] lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 border-b border-[#d7e0ea] bg-white/95 shadow-[0_4px_18px_rgba(16,42,67,0.08)] backdrop-blur lg:hidden">
        <div className="flex h-[68px] items-center justify-between gap-3 px-4">
          <BrandLogo mobile />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d7e0ea] bg-white text-[#405168] shadow-sm transition hover:border-[#9ec3d7] hover:bg-[#f3f8fb] hover:text-[#075f8f]"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="app-overlay-enter absolute inset-0 bg-[#102a43]/55 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="app-panel-enter absolute left-0 top-0 flex h-full w-[88vw] max-w-[340px] flex-col overflow-y-auto border-r border-[#d7e0ea] bg-white p-5 shadow-[0_20px_50px_rgba(16,42,67,0.25)]">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d7e0ea] text-[#405168] transition hover:bg-[#f3f8fb] hover:text-[#075f8f]"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navigation}
          </aside>
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-screen min-h-0 w-[288px] flex-col overflow-y-auto border-r border-[#d4dee8] bg-[#fbfcfe] p-5 shadow-[5px_0_22px_rgba(16,42,67,0.04)] lg:flex">
        {navigation}
      </aside>

      <main className="min-w-0 max-w-full overflow-x-hidden px-4 py-5 sm:px-6 md:px-7 md:py-7 lg:px-8 xl:px-10 xl:py-8">
        <div className="mx-auto w-full min-w-0 max-w-[1600px]">
          {children}
        </div>
      </main>
    </div>
  );
}
