"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  ChevronDown,
  ChevronLeft,
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
  AuthApiError,
  clearSecureSession,
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
const SQUARE_LOGO_PATH = "/UATO/AGA_Logo_Square%20(1).jpg";
const PASSWORD_PAGE = "/change-password";
const SIDEBAR_STORAGE_KEY = "uapl-desktop-sidebar-collapsed";
const SESSION_VERIFICATION_INTERVAL_MS = 2 * 60 * 1000;

let lastSessionVerificationAt = 0;
let sessionVerificationRequest: Promise<SecureSession> | null = null;

function verifySessionOnce(session: SecureSession, force = false) {
  const recentlyVerified =
    Date.now() - lastSessionVerificationAt <
    SESSION_VERIFICATION_INTERVAL_MS;

  if (!force && recentlyVerified) {
    return Promise.resolve(session);
  }

  if (sessionVerificationRequest) {
    return sessionVerificationRequest;
  }

  sessionVerificationRequest = verifySecureSession(session)
    .then((verifiedSession) => {
      lastSessionVerificationAt = Date.now();
      return verifiedSession;
    })
    .finally(() => {
      sessionVerificationRequest = null;
    });

  return sessionVerificationRequest;
}

function isTemporaryVerificationError(error: unknown) {
  return (
    error instanceof AuthApiError &&
    ["NETWORK_ERROR", "HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code)
  );
}

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

function BrandLogo({
  mobile = false,
  compact = false
}: {
  mobile?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <img
        src={SQUARE_LOGO_PATH}
        alt="Apollo Global Academy"
        className="h-11 w-11 rounded-lg object-contain"
      />
    );
  }

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
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDesktopCollapsed(
        localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"
      );
    } catch {
      setDesktopCollapsed(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function initializeSession() {
      const storedSession = getSecureSession();
      if (!storedSession) {
        if (active) setCheckingSession(false);
        router.replace("/");
        return;
      }

      if (active) {
        setSession(storedSession);
        setCheckingSession(false);
      }

      try {
        const verified = await verifySessionOnce(storedSession);
        if (!active) return;
        setSession(verified);
      } catch (error) {
        if (!active) return;
        if (isTemporaryVerificationError(error)) return;

        setSession(null);
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
    const handleAuthenticationExpired = () => {
      lastSessionVerificationAt = 0;
      clearSecureSession();
      setMobileMenuOpen(false);
      setSession(null);
      setCheckingSession(false);
      router.replace("/");
    };

    window.addEventListener(
      "uapl-auth-expired",
      handleAuthenticationExpired
    );

    return () => {
      window.removeEventListener(
        "uapl-auth-expired",
        handleAuthenticationExpired
      );
    };
  }, [router]);

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
        const verified = await verifySessionOnce(storedSession);
        if (active) setSession(verified);
      } catch (error) {
        if (!active) return;
        if (isTemporaryVerificationError(error)) return;

        setSession(null);
        router.replace("/");
      }
    };

    const interval = window.setInterval(
      verifyWithServer,
      SESSION_VERIFICATION_INTERVAL_MS
    );
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void verifyWithServer();
      }
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
    const links = session?.role === "admin" ? adminLinks : trainerLinks;
    const activeGroup = links.find((item) =>
      item.children?.some((child) =>
        pathMatches(pathname, child.href, child.exact)
      )
    );

    if (activeGroup) {
      setExpandedGroup(activeGroup.href);
    }
  }, [pathname, session?.role]);

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

  function toggleDesktopSidebar() {
    setDesktopCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // The preference is optional when browser storage is unavailable.
      }
      return next;
    });
  }

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

  const activeSession = session;
  const links =
    activeSession.role === "admin" ? adminLinks : trainerLinks;

  function renderAccount(compact = false) {
    return (
      <div
        className={`rounded-lg border border-[#d9e2eb] bg-[#f5f8fb] ${
          compact ? "flex justify-center p-2" : "p-3"
        }`}
        title={
          compact
            ? `${activeSession.name} - ${activeSession.role} account`
            : undefined
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#075f8f] shadow-sm ring-1 ring-[#d7e0ea]">
            {activeSession.role === "admin" ? (
              <Shield className="h-5 w-5" />
            ) : (
              <UserCircle className="h-5 w-5" />
            )}
            <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          {!compact ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#16263c]">
                {activeSession.name}
              </p>
              <p className="truncate text-xs capitalize text-[#718096]">
                {activeSession.role} account
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderNavigation(compact = false, mobile = false) {
    return (
      <nav className="space-y-1" aria-label="Primary navigation">
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
            const expanded = expandedGroup === item.href && !compact;
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => {
                    if (compact) {
                      setDesktopCollapsed(false);
                      try {
                        localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
                      } catch {
                        // The navigation still expands without persistence.
                      }
                      setExpandedGroup(item.href);
                      return;
                    }

                    setExpandedGroup((current) =>
                      current === item.href ? null : item.href
                    );
                  }}
                  className={`group relative flex h-11 w-full items-center rounded-lg text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#4ba3c7] focus-visible:ring-offset-2 ${
                    compact ? "justify-center px-2" : "gap-3 px-3"
                  } ${
                    active
                      ? "bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.18)]"
                      : "text-[#506278] hover:bg-[#edf3f7] hover:text-[#16263c]"
                  }`}
                  aria-expanded={expanded}
                  title={compact ? item.label : undefined}
                >
                  {active ? (
                    <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-[#6bc4e8]" />
                  ) : null}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      active ? "text-[#6bc4e8]" : "text-[#708399]"
                    }`}
                  />
                  {!compact ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {item.label}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          expanded ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </>
                  ) : null}
                </button>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                    expanded
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                  aria-hidden={!expanded}
                >
                  <div className="overflow-hidden">
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
                            onClick={() => {
                              if (mobile) setMobileMenuOpen(false);
                            }}
                            className={`relative flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[#4ba3c7] focus-visible:ring-offset-1 ${
                              selected
                                ? "bg-[#eaf4f8] font-semibold text-[#075f8f] ring-1 ring-inset ring-[#d2e9f2]"
                                : "text-[#66798f] hover:bg-[#f0f4f8] hover:text-[#16263c]"
                            }`}
                            aria-current={selected ? "page" : undefined}
                          >
                            {selected ? (
                              <span className="absolute -left-[13px] top-2 h-6 w-1 rounded-full bg-[#c7353d]" />
                            ) : null}
                            <span
                              className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                                selected ? "bg-[#c7353d]" : "bg-[#bdc9d6]"
                              }`}
                            />
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (mobile) setMobileMenuOpen(false);
              }}
              className={`group relative flex h-11 items-center rounded-lg text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#4ba3c7] focus-visible:ring-offset-2 ${
                compact ? "justify-center px-2" : "gap-3 px-3"
              } ${
                active
                  ? "bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.18)]"
                  : "text-[#506278] hover:bg-[#edf3f7] hover:text-[#16263c]"
              }`}
              aria-current={active ? "page" : undefined}
              title={compact ? item.label : undefined}
            >
              {active ? (
                <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-[#6bc4e8]" />
              ) : null}
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  active ? "text-[#6bc4e8]" : "text-[#708399]"
                }`}
              />
              {!compact ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  function renderLogout(compact = false) {
    return (
      <button
        type="button"
        onClick={logout}
        disabled={signingOut}
        className={`flex h-11 w-full items-center rounded-lg text-sm font-semibold text-[#5f7187] outline-none transition hover:bg-red-50 hover:text-[#b4232d] focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          compact ? "justify-center px-2" : "gap-3 px-3"
        }`}
        title={compact ? (signingOut ? "Signing out..." : "Sign out") : undefined}
      >
        {signingOut ? (
          <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
        ) : (
          <LogOut className="h-[18px] w-[18px] shrink-0" />
        )}
        {!compact ? (signingOut ? "Signing out..." : "Sign out") : null}
      </button>
    );
  }

  return (
    <div
      className={`min-h-screen w-full overflow-x-hidden bg-[#eef3f8] transition-[padding-left] duration-300 ease-out ${
        desktopCollapsed ? "lg:pl-[84px]" : "lg:pl-[288px]"
      }`}
    >
      <header className="sticky top-0 z-30 border-b border-[#d7e0ea] bg-white/95 shadow-[0_4px_18px_rgba(16,42,67,0.08)] backdrop-blur lg:hidden">
        <div className="flex h-[68px] items-center justify-between gap-3 px-4">
          <BrandLogo mobile />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d7e0ea] bg-white text-[#405168] shadow-sm outline-none transition hover:border-[#9ec3d7] hover:bg-[#f3f8fb] hover:text-[#075f8f] focus-visible:ring-2 focus-visible:ring-[#4ba3c7]"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 transition lg:hidden ${
          mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-[#102a43]/55 backdrop-blur-[2px] transition-opacity duration-300 ${
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          tabIndex={mobileMenuOpen ? 0 : -1}
        />

        <aside
          className={`absolute left-0 top-0 flex h-full w-[88vw] max-w-[340px] flex-col overflow-hidden border-r border-[#d7e0ea] bg-white shadow-[0_20px_50px_rgba(16,42,67,0.25)] transition-transform duration-300 ease-out ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#dce4ed] bg-white px-4 py-3">
            <BrandLogo mobile />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d7e0ea] text-[#405168] outline-none transition hover:bg-[#f3f8fb] hover:text-[#075f8f] focus-visible:ring-2 focus-visible:ring-[#4ba3c7]"
              aria-label="Close navigation menu"
              tabIndex={mobileMenuOpen ? 0 : -1}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="shrink-0 px-4 py-3">
            {renderAccount()}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {renderNavigation(false, true)}
          </div>

          <div className="shrink-0 border-t border-[#e3e9f0] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {renderLogout()}
          </div>
        </aside>
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden h-dvh min-h-0 flex-col overflow-hidden border-r border-[#d4dee8] bg-[#fbfcfe] shadow-[5px_0_22px_rgba(16,42,67,0.04)] transition-[width] duration-300 ease-out lg:flex ${
          desktopCollapsed ? "w-[84px]" : "w-[288px]"
        }`}
      >
        <div
          className={`shrink-0 border-b border-[#dce4ed] ${
            desktopCollapsed ? "px-3 py-4" : "px-5 py-5"
          }`}
        >
          <div
            className={`flex ${
              desktopCollapsed
                ? "flex-col items-center gap-3"
                : "items-center justify-between gap-3"
            }`}
          >
            <BrandLogo compact={desktopCollapsed} />
            <button
              type="button"
              onClick={toggleDesktopSidebar}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d7e0ea] bg-white text-[#60748a] shadow-sm outline-none transition hover:border-[#9ec3d7] hover:bg-[#f3f8fb] hover:text-[#075f8f] focus-visible:ring-2 focus-visible:ring-[#4ba3c7]"
              aria-label={
                desktopCollapsed
                  ? "Expand navigation panel"
                  : "Collapse navigation panel"
              }
              title={
                desktopCollapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
              }
            >
              {desktopCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div
          className={`shrink-0 ${
            desktopCollapsed ? "px-3 py-3" : "px-5 py-4"
          }`}
        >
          {renderAccount(desktopCollapsed)}
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-4 ${
            desktopCollapsed ? "px-3" : "px-5"
          }`}
        >
          {renderNavigation(desktopCollapsed)}
        </div>

        <div
          className={`shrink-0 border-t border-[#e3e9f0] bg-[#fbfcfe] py-3 ${
            desktopCollapsed ? "px-3" : "px-5"
          }`}
        >
          {renderLogout(desktopCollapsed)}
        </div>
      </aside>

      <main className="min-w-0 max-w-full overflow-x-hidden px-4 py-5 sm:px-6 md:px-7 md:py-7 lg:px-8 xl:px-10 xl:py-8">
        <div className="mx-auto w-full min-w-0 max-w-[1600px]">
          {children}
        </div>
      </main>
    </div>
  );
}
