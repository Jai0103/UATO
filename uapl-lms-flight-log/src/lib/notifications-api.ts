"use client";

import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firebaseFunctions } from "@/lib/firebase-client";

export type AppNotificationState = "unread" | "read" | "follow_up";
export type AppNotificationPriority = "info" | "warning" | "critical";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  category: "approval" | "attendance" | "evaluation" | "flight" | "maintenance" | "training" | "fatigue" | "system";
  priority: AppNotificationPriority;
  actionUrl: string;
  actionLabel: string;
  eventDate: string;
  state: AppNotificationState;
};

type NotificationListResult = {
  notifications: AppNotification[];
  unreadCount: number;
};

let notificationCache: NotificationListResult | null = null;
let notificationCacheAt = 0;
let notificationRequest: Promise<NotificationListResult> | null = null;
const NOTIFICATION_CACHE_MS = 30_000;

async function requireFirebaseUser() {
  await firebaseAuth.authStateReady();
  if (!firebaseAuth.currentUser) {
    throw new Error("Your session has expired. Please sign in again.");
  }
}

export async function fetchUserNotifications(force = false) {
  await requireFirebaseUser();
  if (!force && notificationCache && Date.now() - notificationCacheAt < NOTIFICATION_CACHE_MS) {
    return notificationCache;
  }
  if (notificationRequest) return notificationRequest;
  const call = httpsCallable<Record<string, never>, NotificationListResult>(firebaseFunctions, "listUserNotifications");
  notificationRequest = call({}).then((result) => {
    notificationCache = result.data;
    notificationCacheAt = Date.now();
    return result.data;
  }).finally(() => {
    notificationRequest = null;
  });
  return notificationRequest;
}

export async function setUserNotificationState(
  notificationId: string,
  state: AppNotificationState
) {
  await requireFirebaseUser();
  const call = httpsCallable<
    { notificationId: string; state: AppNotificationState },
    { notificationId: string; state: AppNotificationState }
  >(firebaseFunctions, "setUserNotificationState");
  const result = (await call({ notificationId, state })).data;
  if (notificationCache) {
    notificationCache = {
      notifications: notificationCache.notifications.map((item) =>
        item.id === notificationId ? { ...item, state } : item
      ),
      unreadCount: notificationCache.notifications.filter((item) =>
        item.id === notificationId ? state === "unread" : item.state === "unread"
      ).length
    };
  }
  return result;
}
