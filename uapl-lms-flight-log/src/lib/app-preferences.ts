"use client";

import { firstAccessiblePath, type AccessPermission } from "@/lib/access-control";

export type AppTheme = "light" | "dark" | "system";

export type AppPreferences = {
  theme: AppTheme;
  compactNavigation: boolean;
  reducedMotion: boolean;
  startPage: "/admin" | "/flight-logs";
};

export const PREFERENCES_STORAGE_KEY = "uapl-interface-preferences";
export const LEGACY_THEME_STORAGE_KEY = "uapl-interface-theme";
export const LEGACY_SIDEBAR_STORAGE_KEY = "uapl-desktop-sidebar-collapsed";

export const defaultPreferences: AppPreferences = {
  theme: "system",
  compactNavigation: false,
  reducedMotion: false,
  startPage: "/admin"
};

export function loadPreferences(): AppPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || "{}");
    const legacyTheme = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    const theme = ["light", "dark", "system"].includes(saved.theme)
      ? saved.theme
      : legacyTheme === "dark" || legacyTheme === "light"
        ? legacyTheme
        : "system";
    return {
      theme,
      compactNavigation:
        typeof saved.compactNavigation === "boolean"
          ? saved.compactNavigation
          : localStorage.getItem(LEGACY_SIDEBAR_STORAGE_KEY) === "true",
      reducedMotion: saved.reducedMotion === true,
      startPage: saved.startPage === "/flight-logs" ? "/flight-logs" : "/admin"
    };
  } catch {
    return defaultPreferences;
  }
}

export function applyPreferences(preferences: AppPreferences) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preferences.theme === "dark" ||
    (preferences.theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("reduce-motion", preferences.reducedMotion);
}

export function savePreferences(preferences: AppPreferences) {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  localStorage.setItem(
    LEGACY_THEME_STORAGE_KEY,
    preferences.theme === "system" ? "system" : preferences.theme
  );
  localStorage.setItem(
    LEGACY_SIDEBAR_STORAGE_KEY,
    String(preferences.compactNavigation)
  );
  applyPreferences(preferences);
  window.dispatchEvent(new CustomEvent("uapl-preferences-updated", { detail: preferences }));
}

export function preferredHome(role: "admin" | "trainer", permissions: AccessPermission[] = []) {
  return role === "admin" ? loadPreferences().startPage : firstAccessiblePath(permissions);
}
