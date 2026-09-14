import { collection, doc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase-client";
import { fetchGoogleUsers } from "@/lib/google-api";

export type UserMigrationSource = {
  sourceUserId: string;
  name: string;
  email: string;
  role: "admin" | "trainer";
  status: "active" | "inactive";
  createdAt: string;
  passwordChangedAt: string;
};

export type UserMigrationAnalysis = {
  users: UserMigrationSource[];
  total: number;
  active: number;
  inactive: number;
  admins: number;
  trainers: number;
  invalidItems: string[];
  duplicateEmails: string[];
};

export type UserMigrationProgress = {
  current: number;
  total: number;
  label: string;
};

export type UserMigrationResult = {
  runId: string;
  createdAccounts: number;
  reusedAccounts: number;
  setupEmailsSent: number;
};

export type UserMigrationVerification = {
  verified: boolean;
  expected: number;
  actual: number;
  mismatches: string[];
};

type ConnectedAdmin = { uid: string; email: string };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function firebaseApiKey() {
  const value = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!value) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing from this build.");
  }
  return value;
}

function randomPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

async function identityToolkitPost<T>(
  endpoint: string,
  payload: Record<string, unknown>
) {
  const url =
    "https://identitytoolkit.googleapis.com/v1/" +
    endpoint +
    "?key=" +
    encodeURIComponent(firebaseApiKey());
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok || data.error) {
    const code = text(data.error?.message) || "FIREBASE_AUTH_REQUEST_FAILED";
    const error = new Error(code.replaceAll("_", " ")) as Error & {
      code?: string;
    };
    error.code = code;
    throw error;
  }
  return data;
}

async function createFirebaseAuthAccount(email: string) {
  const result = await identityToolkitPost<{ localId?: string }>(
    "accounts:signUp",
    { email, password: randomPassword(), returnSecureToken: false }
  );
  if (!result.localId) {
    throw new Error("Firebase Authentication did not return a User UID.");
  }
  return result.localId;
}

async function sendPasswordSetupEmail(email: string) {
  await identityToolkitPost("accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email
  });
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function loadGoogleUsersForMigration() {
  const source = await fetchGoogleUsers();
  return (source || []).map((user) => {
    const raw = user as typeof user & {
      accountStatus?: string;
      passwordUpdatedAt?: string;
    };
    return {
      sourceUserId: text(raw.id),
      name: text(raw.name),
      email: normalizedEmail(raw.email),
      role: raw.role === "admin" ? "admin" : "trainer",
      status: raw.accountStatus === "inactive" ? "inactive" : "active",
      createdAt: text(raw.createdAt),
      passwordChangedAt: text(raw.passwordChangedAt || raw.passwordUpdatedAt)
    } satisfies UserMigrationSource;
  });
}

export function analyzeUserMigration(
  users: UserMigrationSource[]
): UserMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateSet = new Set<string>();
  const emails = new Set<string>();

  users.forEach((user, index) => {
    if (!user.sourceUserId || !user.name || !isValidEmail(user.email)) {
      invalidItems.push(
        "User " + (index + 1) + " requires a valid ID, name, and email address."
      );
    }
    if (emails.has(user.email)) duplicateSet.add(user.email);
    emails.add(user.email);
  });

  return {
    users,
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    inactive: users.filter((user) => user.status === "inactive").length,
    admins: users.filter((user) => user.role === "admin").length,
    trainers: users.filter((user) => user.role === "trainer").length,
    invalidItems,
    duplicateEmails: Array.from(duplicateSet).sort()
  };
}

function profileData(user: UserMigrationSource) {
  return {
    sourceUserId: user.sourceUserId,
    name: user.name,
    email: user.email,
    emailLower: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt || null,
    passwordChangedAt: user.passwordChangedAt || null,
    migratedAt: Timestamp.now(),
    migrationSource: "google-sheets",
    schemaVersion: 1
  };
}

export async function migrateUsersToFirebase(
  analysis: UserMigrationAnalysis,
  admin: ConnectedAdmin,
  onProgress?: (progress: UserMigrationProgress) => void
): Promise<UserMigrationResult> {
  if (analysis.invalidItems.length || analysis.duplicateEmails.length) {
    throw new Error("Correct invalid or duplicate source users before migration.");
  }

  const currentProfiles = await getDocs(collection(firestore, "users"));
  const uidByEmail = new Map<string, string>();
  currentProfiles.docs.forEach((profile) => {
    const email = normalizedEmail(profile.data().email);
    if (email) uidByEmail.set(email, profile.id);
  });
  uidByEmail.set(normalizedEmail(admin.email), admin.uid);

  let createdAccounts = 0;
  let reusedAccounts = 0;
  let setupEmailsSent = 0;

  for (let index = 0; index < analysis.users.length; index += 1) {
    const user = analysis.users[index];
    onProgress?.({
      current: index,
      total: analysis.users.length,
      label: "Migrating " + user.name
    });

    let uid = uidByEmail.get(user.email) || "";
    let created = false;
    if (!uid) {
      try {
        uid = await createFirebaseAuthAccount(user.email);
        created = true;
        createdAccounts += 1;
      } catch (error) {
        const code = (error as Error & { code?: string }).code || "";
        if (code.includes("EMAIL_EXISTS")) {
          throw new Error(
            user.email +
              " exists in Firebase Authentication but has no Firestore profile. " +
              "Add its users document using the Firebase UID, then retry."
          );
        }
        throw error;
      }
    } else {
      reusedAccounts += 1;
    }

    await setDoc(doc(firestore, "users", uid), profileData(user), {
      merge: true
    });
    uidByEmail.set(user.email, uid);

    if (created && user.status === "active") {
      await sendPasswordSetupEmail(user.email);
      setupEmailsSent += 1;
    }

    onProgress?.({
      current: index + 1,
      total: analysis.users.length,
      label: "Migrated " + user.name
    });
    await wait(250);
  }

  const runId = "users-auth-" + Date.now();
  await setDoc(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "users-authentication",
    userCount: analysis.total,
    createdAccounts,
    reusedAccounts,
    setupEmailsSent,
    migratedByUid: admin.uid,
    migratedByEmail: admin.email,
    completedAt: Timestamp.now(),
    source: "google-sheets"
  });
  return { runId, createdAccounts, reusedAccounts, setupEmailsSent };
}

export async function verifyUserMigration(
  analysis: UserMigrationAnalysis
): Promise<UserMigrationVerification> {
  const snapshot = await getDocs(collection(firestore, "users"));
  const profiles = new Map(
    snapshot.docs.map((profile) => [
      normalizedEmail(profile.data().email),
      profile.data()
    ])
  );
  const mismatches: string[] = [];
  let actual = 0;

  analysis.users.forEach((user) => {
    const profile = profiles.get(user.email);
    if (!profile) {
      mismatches.push("Missing Firebase profile: " + user.email);
      return;
    }
    actual += 1;
    const expected = profileData(user);
    const fields = ["sourceUserId", "name", "email", "role", "status"] as const;
    fields.forEach((field) => {
      if (text(profile[field]) !== text(expected[field])) {
        mismatches.push(user.email + " differs in " + field + ".");
      }
    });
  });

  return {
    verified: mismatches.length === 0 && actual === analysis.total,
    expected: analysis.total,
    actual,
    mismatches: mismatches.slice(0, 100)
  };
}
