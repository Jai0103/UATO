"use client";

import { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { sessionKey } from "@/lib/demo-auth";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { googleAppsScriptUrl } from "@/lib/google-config";

export type SecureUserRole = "admin" | "trainer";

export type SecureUser = {
  id: string;
  name: string;
  email: string;
  role: SecureUserRole;
  mustChangePassword?: boolean;
};

export type SecureSession = {
  name: string;
  email: string;
  role: SecureUserRole;
  mustChangePassword?: boolean;
  sessionToken: string;
  expiresAt: string;
};

type BaseAuthResponse = {
  ok: boolean;
  success: boolean;
  code?: string;
  message?: string;
};

type SecureLoginResponse = BaseAuthResponse & {
  user?: SecureUser;
  sessionToken?: string;
  expiresAt?: string;
};

const FIREBASE_SESSION_HOURS = 8;
let legacySessionRequest: Promise<string> | null = null;

export class AuthApiError extends Error {
  code: string;
  remainingAttempts?: number;

  constructor(message: string, code = "AUTH_ERROR", remainingAttempts?: number) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
    this.remainingAttempts = remainingAttempts;
  }
}

function firebaseLoginMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Unable to sign in with Firebase. Check your connection and try again.";
  }
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(error.code)) {
    return "Invalid email or password.";
  }
  if (error.code === "auth/too-many-requests") {
    return "Too many sign-in attempts. Wait a moment before trying again.";
  }
  if (error.code === "auth/network-request-failed") {
    return "Unable to reach Firebase Authentication. Check your connection and try again.";
  }
  if (error.code === "auth/user-disabled") {
    return "This account is inactive. Contact your administrator.";
  }
  return "Firebase Authentication could not complete the sign-in.";
}

function firebasePasswordMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) return "Unable to change your password.";
  if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
    return "Your current password is incorrect.";
  }
  if (error.code === "auth/requires-recent-login") {
    return "Please sign out, sign in again, and retry the password change.";
  }
  if (error.code === "auth/weak-password") {
    return "The new password does not meet Firebase security requirements.";
  }
  if (error.code === "auth/network-request-failed") {
    return "Unable to reach Firebase Authentication. Check your connection.";
  }
  return "Unable to change your password.";
}

async function postAuthentication<T>(payload: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(googleAppsScriptUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new AuthApiError("The compatibility service returned an error.", "HTTP_ERROR");
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuthApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AuthApiError("Google Sheets took too long to respond.", "REQUEST_TIMEOUT");
    }
    throw new AuthApiError("Unable to connect to the Google compatibility service.", "NETWORK_ERROR");
  } finally {
    window.clearTimeout(timeout);
  }
}

function responseSucceeded(response: BaseAuthResponse) {
  return response.success ?? response.ok;
}

async function firebaseProfile() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new AuthApiError("Your session has expired. Please sign in again.", "AUTH_REQUIRED");
  }
  const snapshot = await getDoc(doc(firestore, "users", user.uid));
  if (!snapshot.exists()) {
    throw new AuthApiError("Your application profile was not found.", "ACCOUNT_NOT_FOUND");
  }
  const profile = snapshot.data();
  if (profile.status !== "active") {
    throw new AuthApiError("This account is inactive. Contact your administrator.", "ACCOUNT_INACTIVE");
  }
  return {
    user,
    name: String(profile.name || user.displayName || user.email || "User"),
    email: String(profile.email || user.email || "").toLowerCase(),
    role: profile.role === "admin" ? "admin" as const : "trainer" as const
  };
}

export async function loginSecurely(identifier: string, password: string): Promise<SecureSession> {
  const loginEmail = identifier.trim().toLowerCase();
  if (!loginEmail.includes("@")) {
    throw new AuthApiError("Sign in using your registered email address.", "EMAIL_REQUIRED");
  }
  try {
    await setPersistence(firebaseAuth, browserLocalPersistence);
    await signInWithEmailAndPassword(firebaseAuth, loginEmail, password);
    const profile = await firebaseProfile();
    const session: SecureSession = {
      name: profile.name,
      email: profile.email,
      role: profile.role,
      mustChangePassword: false,
      sessionToken: "",
      expiresAt: new Date(Date.now() + FIREBASE_SESSION_HOURS * 60 * 60 * 1000).toISOString()
    };
    saveSecureSession(session);
    void ensureLegacySessionToken().catch(() => undefined);
    return session;
  } catch (error) {
    if (error instanceof AuthApiError) {
      await signOut(firebaseAuth).catch(() => undefined);
      throw error;
    }
    await signOut(firebaseAuth).catch(() => undefined);
    throw new AuthApiError(firebaseLoginMessage(error), "FIREBASE_LOGIN_FAILED");
  }
}

export async function ensureLegacySessionToken() {
  const session = getSecureSession();
  if (!session) throw new AuthApiError("Sign in again to continue.", "AUTH_REQUIRED");
  if (session.sessionToken) return session.sessionToken;
  if (legacySessionRequest) return legacySessionRequest;

  legacySessionRequest = (async () => {
    await firebaseAuth.authStateReady();
    const user = firebaseAuth.currentUser;
    if (!user) throw new AuthApiError("Sign in again to continue.", "AUTH_REQUIRED");
    const idToken = await user.getIdToken();
    const result = await postAuthentication<SecureLoginResponse>({
      action: "exchangeFirebaseSession",
      idToken
    });
    if (!responseSucceeded(result) || !result.sessionToken) {
      throw new AuthApiError(
        result.message || "Unable to open the Google compatibility session.",
        result.code || "SESSION_EXCHANGE_FAILED"
      );
    }
    const current = getSecureSession();
    if (!current) throw new AuthApiError("Sign in again to continue.", "AUTH_REQUIRED");
    saveSecureSession({
      ...current,
      sessionToken: result.sessionToken,
      expiresAt: result.expiresAt || current.expiresAt
    });
    return result.sessionToken;
  })().finally(() => {
    legacySessionRequest = null;
  });

  return legacySessionRequest;
}

export async function verifySecureSession(session: SecureSession): Promise<SecureSession> {
  if (isSessionExpired(session)) {
    clearSecureSession();
    throw new AuthApiError("Your session has expired. Please sign in again.", "AUTH_REQUIRED");
  }
  try {
    const profile = await firebaseProfile();
    const verified: SecureSession = {
      ...session,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      mustChangePassword: false
    };
    saveSecureSession(verified);
    return verified;
  } catch (error) {
    if (error instanceof AuthApiError) {
      clearSecureSession();
      await signOut(firebaseAuth).catch(() => undefined);
      throw error;
    }
    throw new AuthApiError("Unable to verify your Firebase session.", "NETWORK_ERROR");
  }
}

export async function changePasswordSecurely(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<SecureSession> {
  if (newPassword !== confirmPassword) {
    throw new AuthApiError("The new passwords do not match.", "PASSWORD_MISMATCH");
  }
  const session = getSecureSession();
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!session || !user || !user.email) {
    throw new AuthApiError("Your session has expired. Please sign in again.", "AUTH_REQUIRED");
  }
  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    const updated = { ...session, mustChangePassword: false };
    saveSecureSession(updated);
    return updated;
  } catch (error) {
    throw new AuthApiError(firebasePasswordMessage(error), "PASSWORD_CHANGE_FAILED");
  }
}

export async function logoutSecurely() {
  const session = getSecureSession();
  clearSecureSession();
  const operations: Promise<unknown>[] = [signOut(firebaseAuth).catch(() => undefined)];
  if (session?.sessionToken) {
    operations.push(
      postAuthentication<BaseAuthResponse>({
        action: "secureLogout",
        sessionToken: session.sessionToken
      }).catch(() => undefined)
    );
  }
  await Promise.allSettled(operations);
}

export function saveSecureSession(session: SecureSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function getSecureSession(): SecureSession | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(sessionKey);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<SecureSession>;
    if (!parsed.name || !parsed.email || !parsed.role || !parsed.expiresAt) {
      clearSecureSession();
      return null;
    }
    const session: SecureSession = {
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      mustChangePassword: false,
      sessionToken: String(parsed.sessionToken || ""),
      expiresAt: parsed.expiresAt
    };
    if (isSessionExpired(session)) {
      clearSecureSession();
      return null;
    }
    return session;
  } catch {
    clearSecureSession();
    return null;
  }
}

export function clearSecureSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(sessionKey);
}

export function isSessionExpired(session: Pick<SecureSession, "expiresAt">) {
  const expiration = new Date(session.expiresAt).getTime();
  return !Number.isFinite(expiration) || expiration <= Date.now();
}

export function getSessionToken() {
  return getSecureSession()?.sessionToken || "";
}

export function getSessionRemainingTime() {
  const session = getSecureSession();
  if (!session) return 0;
  return Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
}
