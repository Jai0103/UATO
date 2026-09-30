"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  ChevronDown,
  ClipboardList,
  Database,
  FileText,
  History,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  UserRound,
  UserCog,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingScreen } from "@/components/loading-overlay";
import { NotificationCenter } from "@/components/notification-center";
import {
  AuthApiError,
  clearSecureSession,
  getSecureSession,
  isSessionExpired,
  logoutSecurely,
  saveSecureSession,
  type SecureSession,
  verifySecureSession
} from "@/lib/auth-api";
import { loadPreferences, savePreferences, type AppPreferences } from "@/lib/app-preferences";
import { fetchOwnProfile, type UserProfile } from "@/lib/profile-api";
import {
  firstAccessiblePath,
  hasAccess,
  permissionForPath,
  type AccessPermission
} from "@/lib/access-control";

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
      {
        href: "/fatigue-risk",
        label: "Fatigue Risk Identification",
        exact: true
      },
      { href: "/attendance", label: "QR Attendance", exact: true },
      { href: "/evaluations", label: "Student Evaluations", exact: true },
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
        href: "/fatigue-risk/records",
        label: "Fatigue Risk Records",
        exact: true
      },
      {
        href: "/attendance/records",
        label: "Attendance Records",
        exact: true
      },
      {
        href: "/evaluations/records",
        label: "Evaluation Records",
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
      { href: "/training-catalogue", label: "Training Catalogue", exact: true },
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
      },
      {
        href: "/evaluations/master-data",
        label: "Evaluation Data",
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

function trainerLinksFor(permissions: AccessPermission[]): NavigationItem[] {
  const subject = { role: "trainer" as const, permissions };
  return [
    hasAccess(subject, "flightLogs") ? { href: "/flight-logs", label: "Flight Logs", icon: ClipboardList } : null,
    hasAccess(subject, "flightLogs") ? { href: "/records", label: "Flight Log Records", icon: Archive } : null,
    hasAccess(subject, "attendance") ? { href: "/attendance/trainer", label: "QR Attendance", icon: ClipboardList } : null,
    hasAccess(subject, "evaluations") ? { href: "/evaluations/trainer", label: "Student Evaluations", icon: ClipboardList } : null,
    hasAccess(subject, "staffTraining") ? { href: "/staff-training", label: "Staff Training", icon: ClipboardList } : null,
    hasAccess(subject, "uaMaintenance") ? { href: "/ua-maintenance", label: "UA Maintenance", icon: ClipboardList } : null,
    hasAccess(subject, "fatigueRisk") ? { href: "/fatigue-risk", label: "Fatigue Risk", icon: ClipboardList } : null,
    hasAccess(subject, "reports") ? { href: "/reports", label: "Reports", icon: FileText } : null
  ].filter((item): item is NavigationItem => item !== null);
}

function pathMatches(pathname: string, href: string, exact = false) {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string) {
  const entries: Array<[string, string]> = [
    ["/admin", "Dashboard"],
    ["/profile", "My Profile"],
    ["/settings", "Settings"],
    ["/approvals", "AGA Approvals"],
    ["/attendance", "QR Attendance"],
    ["/evaluations", "Student Evaluations"],
    ["/flight-logs", "Flight Logs"],
    ["/records", "Records"],
    ["/training-catalogue", "Training Catalogue"],
    ["/master-data", "Master Data"],
    ["/reports", "Reports"],
    ["/users", "Users"],
    ["/audit-history", "Audit History"],
    ["/staff-training", "Staff Training"],
    ["/ua-maintenance", "UA Maintenance"],
    ["/fatigue-risk", "Fatigue Risk"],
    ["/inventory", "Inventory"]
  ];
  return entries.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] || "Workspace";
}

function userInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
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
          UATO Management
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const prefetchedRoutes = useRef(new Set<string>());
  const profileCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      setDesktopCollapsed(loadPreferences().compactNavigation);
    } catch {
      setDesktopCollapsed(false);
    }
  }, []);

  useEffect(() => {
    const updateHeaderElevation = () => setHeaderElevated(window.scrollY > 8);
    updateHeaderElevation();
    window.addEventListener("scroll", updateHeaderElevation, { passive: true });
    return () => window.removeEventListener("scroll", updateHeaderElevation);
  }, []);

  useEffect(() => {
    const updatePreferences = (event: Event) => {
      const preferences = (event as CustomEvent<AppPreferences>).detail;
      setDesktopCollapsed(preferences.compactNavigation);
    };
    window.addEventListener("uapl-preferences-updated", updatePreferences);
    return () => window.removeEventListener("uapl-preferences-updated", updatePreferences);
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

      // A valid local session was already authenticated at login. Treat it as
      // recently verified so the first page data request is not competing with
      // a second Apps Script authentication request.
      if (lastSessionVerificationAt === 0) {
        lastSessionVerificationAt = Date.now();
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

    if (session.role !== "admin") {
      const required = permissionForPath(pathname);
      if (required === "admin" || (required && !hasAccess(session, required))) {
        router.replace(firstAccessiblePath(session.permissions));
      }
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
    setProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const loadProfile = () => fetchOwnProfile().then((result) => {
      if (!active) return;
      setProfile(result);
      setSession((current) => {
        if (!current) return current;
        const next = { ...current, name: result.name, role: result.role, permissions: result.permissions };
        if (JSON.stringify(current) === JSON.stringify(next)) return current;
        saveSecureSession(next);
        return next;
      });
    }).catch(() => undefined);
    void loadProfile();
    const updateProfile = (event: Event) => {
      const result = (event as CustomEvent<UserProfile>).detail;
      setProfile(result);
      setSession((current) => {
        if (!current) return current;
        const next = { ...current, name: result.name, role: result.role, permissions: result.permissions };
        saveSecureSession(next);
        return next;
      });
    };
    window.addEventListener("uapl-profile-updated", updateProfile);
    return () => {
      active = false;
      window.removeEventListener("uapl-profile-updated", updateProfile);
    };
  }, [session?.email]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest("[data-profile-menu]")) setProfileMenuOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    const links = session?.role === "admin" ? adminLinks : trainerLinksFor(session?.permissions || []);
    const activeGroup = links.find((item) =>
      item.children?.some((child) =>
        pathMatches(pathname, child.href, child.exact)
      )
    );

    if (activeGroup) {
      setExpandedGroup(activeGroup.href);
    }
  }, [pathname, session?.permissions, session?.role]);

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
        savePreferences({ ...loadPreferences(), compactNavigation: next });
      } catch {
        // The preference is optional when browser storage is unavailable.
      }
      return next;
    });
  }

  function warmRoute(href: string) {
    if (
      pathMatches(pathname, href, true) ||
      prefetchedRoutes.current.has(href)
    ) {
      return;
    }

    prefetchedRoutes.current.add(href);
    router.prefetch(href);
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
    return <LoadingScreen label="Opening workspace" description="Checking your access" />;
  }

  const activeSession = session;
  const links =
    activeSession.role === "admin" ? adminLinks : trainerLinksFor(activeSession.permissions);

  function openProfileMenu() {
    if (profileCloseTimer.current) window.clearTimeout(profileCloseTimer.current);
    setProfileMenuOpen(true);
  }

  function scheduleProfileClose() {
    profileCloseTimer.current = window.setTimeout(() => setProfileMenuOpen(false), 180);
  }

  function renderProfileMenu(compact = false) {
    const displayName = profile?.name || activeSession.name;
    return (
      <div data-profile-menu className="relative" onMouseEnter={openProfileMenu} onMouseLeave={scheduleProfileClose} onFocusCapture={openProfileMenu}>
        <button type="button" onClick={() => setProfileMenuOpen((current) => !current)} className={`group flex h-11 items-center rounded-lg border border-transparent bg-transparent outline-none transition hover:bg-[#eef3f7] focus-visible:ring-2 focus-visible:ring-[#4ba3c7] ${compact ? "w-11 justify-center" : "gap-3 pl-1.5 pr-2"}`} aria-expanded={profileMenuOpen} aria-label="Open account menu">
          <span className="relative h-8 w-8 shrink-0">
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#e6f2f8] text-xs font-bold text-[#075f8f] shadow-sm">
              {profile?.photoURL ? <img key={`${profile.photoURL}-${profile.updatedAt}`} src={`${profile.photoURL}${profile.photoURL.includes("?") ? "&" : "?"}v=${encodeURIComponent(profile.updatedAt || "current")}`} alt="" className="h-full w-full object-cover" /> : userInitials(displayName)}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
          </span>
          {!compact ? <span className="hidden min-w-0 text-left sm:block"><span className="block max-w-36 truncate text-sm font-semibold text-[#16263c]">{displayName}</span><span className="block text-[11px] capitalize text-[#718096]">{activeSession.role}</span></span> : null}
          {!compact ? <ChevronDown className={`h-4 w-4 text-[#718096] transition-transform ${profileMenuOpen ? "rotate-180" : ""}`} /> : null}
        </button>
        <div className={`absolute right-0 top-full z-[80] mt-2 w-[280px] origin-top-right rounded-lg border border-[#d7e0ea] bg-white p-2 shadow-[0_18px_45px_rgba(16,42,67,0.18)] transition ${profileMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
          <div className="border-b border-[#e6ecf2] px-3 py-3"><p className="truncate text-sm font-bold text-[#16263c]">{displayName}</p><p className="mt-1 truncate text-xs text-[#718096]">{activeSession.email}</p></div>
          <Link href="/profile" className="app-account-menu-item group mt-1 flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#405168] transition"><UserRound size={17} className="transition-transform group-hover:scale-110" /> My Profile</Link>
          <Link href="/settings" className="app-account-menu-item group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#405168] transition"><Settings size={17} className="transition-transform group-hover:rotate-12" /> Settings</Link>
          <div className="my-1 border-t border-[#e6ecf2]" />
          <button type="button" onClick={() => void logout()} disabled={signingOut} className="app-account-logout group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-rose-700 transition disabled:opacity-60">{signingOut ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} className="transition-transform group-hover:translate-x-0.5" />} {signingOut ? "Signing out..." : "Log out"}</button>
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
                        savePreferences({ ...loadPreferences(), compactNavigation: false });
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
                  className={`app-nav-item group relative flex h-11 w-full items-center rounded-lg text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#4ba3c7] focus-visible:ring-offset-2 ${
                    compact ? "justify-center px-2" : "gap-3 px-3"
                  } ${
                    active
                      ? "app-nav-item-active bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.18)]"
                      : "app-nav-item-idle text-[#506278] hover:bg-[#edf3f7] hover:text-[#16263c]"
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
                            prefetch={false}
                            onPointerEnter={() => warmRoute(child.href)}
                            onFocus={() => warmRoute(child.href)}
                            onTouchStart={() => warmRoute(child.href)}
                            onClick={() => {
                              if (mobile) setMobileMenuOpen(false);
                            }}
                            className={`relative flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[#4ba3c7] focus-visible:ring-offset-1 ${
                              selected
                                ? "app-nav-child-active bg-[#eaf4f8] font-semibold text-[#075f8f] ring-1 ring-inset ring-[#d2e9f2]"
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
              prefetch={false}
              onPointerEnter={() => warmRoute(item.href)}
              onFocus={() => warmRoute(item.href)}
              onTouchStart={() => warmRoute(item.href)}
              onClick={() => {
                if (mobile) setMobileMenuOpen(false);
              }}
              className={`app-nav-item group relative flex h-11 items-center rounded-lg text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#4ba3c7] focus-visible:ring-offset-2 ${
                compact ? "justify-center px-2" : "gap-3 px-3"
              } ${
                active
                  ? "app-nav-item-active bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.18)]"
                  : "app-nav-item-idle text-[#506278] hover:bg-[#edf3f7] hover:text-[#16263c]"
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

  return (
    <div
      className={`app-shell min-h-screen w-full overflow-x-clip bg-[#eef3f8] transition-[padding-left] duration-300 ease-out ${
        desktopCollapsed ? "lg:pl-[84px]" : "lg:pl-[288px]"
      }`}
    >
      <header className={`app-mobile-header fixed inset-x-0 top-0 z-40 border-b border-[#d7e0ea] bg-white/95 backdrop-blur lg:hidden ${headerElevated ? "app-top-header-elevated" : ""}`}>
        <div className="grid h-[64px] grid-cols-[44px_minmax(0,1fr)_92px] items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d7e0ea] bg-white text-[#405168] outline-none transition hover:border-[#9ec3d7] hover:bg-[#f3f8fb] hover:text-[#075f8f] focus-visible:ring-2 focus-visible:ring-[#4ba3c7]"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[10px] font-bold uppercase text-[#718096]">UATO Management</p>
            <p className="truncate text-sm font-bold text-[#16263c]">{pageTitle(pathname)}</p>
          </div>
          <div className="flex items-center justify-end gap-1">
            <NotificationCenter />
            {renderProfileMenu(true)}
          </div>
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
          className={`app-sidebar absolute left-0 top-0 flex h-full w-[88vw] max-w-[340px] flex-col overflow-hidden border-r border-[#d7e0ea] bg-white shadow-[0_20px_50px_rgba(16,42,67,0.25)] transition-transform duration-300 ease-out ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="app-brand-zone flex shrink-0 items-center justify-between gap-3 border-b border-[#dce4ed] bg-white px-4 py-3">
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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {renderNavigation(false, true)}
          </div>
        </aside>
      </div>

      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 hidden h-dvh min-h-0 flex-col overflow-visible border-r border-[#d4dee8] bg-[#fbfcfe] shadow-[5px_0_22px_rgba(16,42,67,0.04)] transition-[width] duration-300 ease-out lg:flex ${
          desktopCollapsed ? "w-[84px]" : "w-[288px]"
        }`}
      >
        <div className={`app-brand-zone relative flex shrink-0 items-center border-b border-[#dce4ed] ${desktopCollapsed ? "h-[104px] flex-col justify-center gap-2 px-3" : "h-[82px] justify-between gap-3 px-5"}`}>
          <div
            className={`flex ${
              desktopCollapsed
                ? "justify-center"
                : "items-center"
            }`}
          >
            <BrandLogo compact={desktopCollapsed} />
          </div>

          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className={`app-sidebar-toggle flex shrink-0 items-center justify-center rounded-md border border-transparent bg-[#f1f4f7] text-[#60748a] outline-none transition hover:bg-[#e5edf3] hover:text-[#075f8f] focus-visible:ring-2 focus-visible:ring-[#4ba3c7] ${desktopCollapsed ? "h-8 w-8" : "h-9 w-9"}`}
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
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-4 ${
            desktopCollapsed ? "px-3" : "px-5"
          }`}
        >
          {renderNavigation(desktopCollapsed)}
        </div>

      </aside>

      <header className={`app-top-header fixed right-0 top-0 z-30 hidden h-[68px] items-center justify-between border-b border-[#d7e0ea] bg-white/95 px-8 backdrop-blur transition-[left,box-shadow] duration-300 lg:flex xl:px-10 ${desktopCollapsed ? "lg:left-[84px]" : "lg:left-[288px]"} ${headerElevated ? "app-top-header-elevated" : ""}`}>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase text-[#718096]">UATO Management System</p><p className="mt-0.5 truncate text-base font-bold text-[#16263c]">{pageTitle(pathname)}</p></div>
        <div className="flex items-center gap-1.5">
          <NotificationCenter />
          {renderProfileMenu(false)}
        </div>
      </header>

      <div className="h-[64px] lg:h-[68px]" aria-hidden="true" />

      <main className="app-main min-w-0 max-w-full overflow-x-hidden px-4 py-5 sm:px-6 md:px-7 md:py-7 lg:px-8 xl:px-10 xl:py-8">
        <div className="mx-auto w-full min-w-0 max-w-[1600px]">
          {children}
        </div>
      </main>
    </div>
  );
}
