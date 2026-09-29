"use client";

import { FirebaseError } from "firebase/app";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "firebase/storage";
import {
  firebaseAuth,
  firebaseFunctions,
  firestore,
  firebaseStorage
} from "@/lib/firebase-client";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: "admin" | "trainer";
  status: "active" | "inactive";
  photoURL: string;
  avatarPath: string;
  updatedAt: string;
};

function value(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return String(value ?? "").trim();
}

function profile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    name: value(data.name),
    email: value(data.email).toLowerCase(),
    role: data.role === "admin" ? "admin" : "trainer",
    status: data.status === "inactive" ? "inactive" : "active",
    photoURL: value(data.photoURL),
    avatarPath: value(data.avatarPath),
    updatedAt: value(data.updatedAt)
  };
}

async function currentUser() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  return user;
}

export async function fetchOwnProfile() {
  const user = await currentUser();
  const snapshot = await getDoc(doc(firestore, "users", user.uid));
  if (!snapshot.exists()) throw new Error("Your user profile could not be found.");
  return profile(user.uid, snapshot.data());
}

export async function saveOwnProfile(input: {
  name: string;
  photoURL: string;
  avatarPath: string;
}) {
  await currentUser();
  try {
    const callable = httpsCallable<
      typeof input,
      { profile: Record<string, unknown> & { uid: string } }
    >(firebaseFunctions, "updateOwnProfile");
    const result = await callable(input);
    const updated = profile(result.data.profile.uid, result.data.profile);
    window.dispatchEvent(new CustomEvent("uapl-profile-updated", { detail: updated }));
    return updated;
  } catch (error) {
    if (error instanceof FirebaseError) {
      const message = error.message
        .replace(/^Firebase:\s*/i, "")
        .replace(/\s*\(functions\/[^)]+\)\.?$/i, "")
        .trim();
      throw new Error(message || "Your profile could not be updated.");
    }
    throw error;
  }
}

export async function uploadOwnAvatar(blob: Blob) {
  const user = await currentUser();
  await user.getIdToken(true);
  const path = `user-avatars/${user.uid}/avatar.webp`;
  const storageReference = ref(firebaseStorage, path);
  try {
    await uploadBytes(storageReference, blob, {
      contentType: "image/webp",
      cacheControl: "private,max-age=300"
    });
    return { path, url: await getDownloadURL(storageReference) };
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (error.code === "storage/unauthorized") {
        throw new Error(
          "Firebase Storage refused the photo. Deploy the latest Storage rules, then sign out and sign in again."
        );
      }
      if (error.code === "storage/retry-limit-exceeded") {
        throw new Error("The photo upload timed out. Check your connection and try again.");
      }
      throw new Error(error.message.replace(/^Firebase:\s*/i, "").trim());
    }
    throw error;
  }
}

export async function deleteOwnAvatar(path: string) {
  const user = await currentUser();
  const expected = `user-avatars/${user.uid}/avatar.webp`;
  if (path && path === expected) {
    await deleteObject(ref(firebaseStorage, path)).catch(() => undefined);
  }
}
