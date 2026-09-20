"use client";

import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  firebaseAuth,
  firebaseFunctions,
  firestore
} from "@/lib/firebase-client";

export type FirebaseManagedUser = {
  id: string;
  sourceUserId: string;
  name: string;
  email: string;
  role: "admin" | "trainer";
  status: "active" | "inactive";
  createdAt: string;
  passwordChangedAt: string;
  updatedAt: string;
};

type UserResult = { user: Record<string, unknown> & { id: string } };

function text(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return String(value ?? "").trim();
}

function toUser(id: string, value: Record<string, unknown>): FirebaseManagedUser {
  return {
    id,
    sourceUserId: text(value.sourceUserId || id),
    name: text(value.name),
    email: text(value.email).toLowerCase(),
    role: value.role === "admin" ? "admin" : "trainer",
    status: value.status === "inactive" ? "inactive" : "active",
    createdAt: text(value.createdAt),
    passwordChangedAt: text(value.passwordChangedAt),
    updatedAt: text(value.updatedAt)
  };
}

function friendlyFunctionError(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error : new Error("The account operation failed.");
  }
  const message = String(error.message || "")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\(functions\/[^)]+\)\.?$/i, "")
    .trim();
  return new Error(message || "The account operation failed.");
}

async function callUserFunction<TInput extends Record<string, unknown>>(
  name: string,
  input: TInput
) {
  await firebaseAuth.authStateReady();
  if (!firebaseAuth.currentUser) {
    throw new Error("Your Firebase session has expired. Please sign in again.");
  }
  try {
    const callable = httpsCallable<TInput, UserResult>(firebaseFunctions, name);
    const result = await callable(input);
    return toUser(result.data.user.id, result.data.user);
  } catch (error) {
    throw friendlyFunctionError(error);
  }
}

export async function fetchFirebaseUsers() {
  await firebaseAuth.authStateReady();
  if (!firebaseAuth.currentUser) {
    throw new Error("Your Firebase session has expired. Please sign in again.");
  }
  const snapshot = await getDocs(collection(firestore, "users"));
  return snapshot.docs
    .map((item) => toUser(item.id, item.data()))
    .sort((first, second) => first.name.localeCompare(second.name));
}

export function createFirebaseUser(input: {
  name: string;
  email: string;
  role: "admin" | "trainer";
}) {
  return callUserFunction("adminCreateUser", input);
}

export function updateFirebaseUser(input: {
  uid: string;
  name: string;
  role: "admin" | "trainer";
}) {
  return callUserFunction("adminUpdateUser", input);
}

export function setFirebaseUserStatus(
  uid: string,
  status: "active" | "inactive"
) {
  return callUserFunction("adminSetUserStatus", { uid, status });
}

export async function requestFirebasePasswordReset(user: FirebaseManagedUser) {
  await firebaseAuth.authStateReady();
  if (!firebaseAuth.currentUser) {
    throw new Error("Your Firebase session has expired. Please sign in again.");
  }
  try {
    const callable = httpsCallable<{ uid: string }, { email: string }>(
      firebaseFunctions,
      "adminRequestPasswordReset"
    );
    const result = await callable({ uid: user.id });
    const resetEmail = String(result.data.email || user.email).trim().toLowerCase();
    await sendPasswordResetEmail(firebaseAuth, resetEmail);
    return resetEmail;
  } catch (error) {
    throw friendlyFunctionError(error);
  }
}

export async function deleteFirebaseUser(uid: string) {
  await firebaseAuth.authStateReady();
  if (!firebaseAuth.currentUser) {
    throw new Error("Your Firebase session has expired. Please sign in again.");
  }
  try {
    const callable = httpsCallable<{ uid: string }, { uid: string }>(
      firebaseFunctions,
      "adminDeleteUser"
    );
    await callable({ uid });
  } catch (error) {
    throw friendlyFunctionError(error);
  }
}

