"use client";

import { FirebaseError } from "firebase/app";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Users
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { sessionKey } from "@/lib/demo-auth";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import {
  analyzeUserMigration,
  loadGoogleUsersForMigration,
  migrateUsersToFirebase,
  verifyUserMigration,
  type UserMigrationAnalysis,
  type UserMigrationProgress,
  type UserMigrationResult,
  type UserMigrationVerification
} from "@/lib/users-firebase-migration";

type ConnectedAdmin = {
  uid: string;
  email: string;
  name: string;
};

function readableError(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/invalid-credential") {
      return "The Firebase email or password is incorrect.";
    }
    if (error.code === "permission-denied") {
      return "Firestore denied this operation. Deploy the latest rules first.";
    }
    return error.message + " (" + error.code + ")";
  }
  return error instanceof Error ? error.message : "The migration operation failed.";
}

function hasAppsScriptSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return false;
    const session = JSON.parse(raw) as {
      sessionToken?: string;
      expiresAt?: string;
    };
    return Boolean(
      session.sessionToken &&
        session.expiresAt &&
        new Date(session.expiresAt).getTime() > Date.now()
    );
  } catch {
    return false;
  }
}

export default function UsersMigrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<ConnectedAdmin | null>(null);
  const [analysis, setAnalysis] = useState<UserMigrationAnalysis | null>(null);
  const [progress, setProgress] = useState<UserMigrationProgress | null>(null);
  const [result, setResult] = useState<UserMigrationResult | null>(null);
  const [verification, setVerification] =
    useState<UserMigrationVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connectFirebase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setPersistence(firebaseAuth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password
      );
      const profileSnapshot = await getDoc(
        doc(firestore, "users", credential.user.uid)
      );
      if (!profileSnapshot.exists()) {
        throw new Error("The Firebase user profile does not exist.");
      }
      const profile = profileSnapshot.data();
      if (profile.status !== "active" || profile.role !== "admin") {
        throw new Error("Only an active Firebase administrator can run migration.");
      }
      setAdmin({
        uid: credential.user.uid,
        email: String(credential.user.email || profile.email || ""),
        name: String(profile.name || credential.user.email || "Administrator")
      });
    } catch (connectionError) {
      setAdmin(null);
      setError(readableError(connectionError));
    } finally {
      setBusy(false);
    }
  }

  async function analyzeSource() {
    if (!admin) return;
    if (!hasAppsScriptSession()) {
      setError("Sign in to the normal staging application first, then return here.");
      return;
    }
    setBusy(true);
    setError("");
    setAnalysis(null);
    setResult(null);
    setVerification(null);
    try {
      const users = await loadGoogleUsersForMigration();
      setAnalysis(analyzeUserMigration(users));
    } catch (analysisError) {
      setError(readableError(analysisError));
    } finally {
      setBusy(false);
    }
  }

  async function copySource() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setResult(null);
    setVerification(null);
    try {
      setResult(
        await migrateUsersToFirebase(
          analysis,
          { uid: admin.uid, email: admin.email },
          setProgress
        )
      );
    } catch (migrationError) {
      setError(readableError(migrationError));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function verifySource() {
    if (!analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);
    try {
      setVerification(await verifyUserMigration(analysis));
    } catch (verificationError) {
      setError(readableError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  const blocked = Boolean(
    analysis?.invalidItems.length || analysis?.duplicateEmails.length
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <Users className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-cyan-300">
              Administrator migration utility
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Users and Firebase Authentication
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Copy safe user profiles, create missing Firebase accounts, and
              email password setup links. Existing passwords are never copied.
            </p>
          </header>

          {!admin ? (
            <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={connectFirebase}>
              <Input
                label="Firebase admin email"
                type="email"
                value={email}
                onChange={setEmail}
              />
              <Input
                label="Firebase password"
                type="password"
                value={password}
                onChange={setPassword}
              />
              <ActionButton busy={busy} label="Connect Firebase administrator">
                <ShieldCheck className="h-5 w-5" />
              </ActionButton>
            </form>
          ) : (
            <div className="space-y-5 px-6 py-6 sm:px-8">
              <div className="flex gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-100">
                    Firebase admin connected
                  </p>
                  <p className="text-sm text-emerald-200/80">
                    {admin.name} - {admin.email}
                  </p>
                </div>
              </div>

              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 font-bold hover:border-cyan-400 disabled:opacity-60"
                disabled={busy}
                onClick={analyzeSource}
                type="button"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Users className="h-5 w-5" />
                )}
                Analyze Google Sheets Users
              </button>

              {progress ? (
                <Progress progress={progress} />
              ) : null}

              {analysis ? (
                <section className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                  <h2 className="text-lg font-bold">Migration review</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Stat label="Users" value={analysis.total} />
                    <Stat label="Active" value={analysis.active} />
                    <Stat label="Inactive" value={analysis.inactive} />
                    <Stat label="Administrators" value={analysis.admins} />
                    <Stat label="Trainers" value={analysis.trainers} />
                  </div>

                  {blocked ? (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      <p className="font-bold">Source users require correction</p>
                      {[...analysis.invalidItems, ...analysis.duplicateEmails].map(
                        (item) => (
                          <p className="mt-1 break-words" key={item}>
                            {item}
                          </p>
                        )
                      )}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm leading-6 text-cyan-100">
                    Active new users receive a Firebase password setup email.
                    Inactive profiles are copied but receive no email. Google
                    passwords and temporary passwords are excluded.
                  </div>

                  <button
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 font-bold text-slate-950 disabled:opacity-50"
                    disabled={busy || blocked}
                    onClick={copySource}
                    type="button"
                  >
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <KeyRound className="h-5 w-5" />
                    )}
                    Create Firebase Accounts and Profiles
                  </button>
                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 font-bold text-cyan-100 disabled:opacity-50"
                    disabled={busy || blocked}
                    onClick={verifySource}
                    type="button"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Verify Firebase Profiles
                  </button>
                </section>
              ) : null}
            </div>
          )}

          {error ? <Notice success={false} text={error} /> : null}
          {result ? (
            <Notice
              success
              text={
                "User migration completed. Created " +
                result.createdAccounts +
                " account(s), reused " +
                result.reusedAccounts +
                ", and sent " +
                result.setupEmailsSent +
                " setup email(s). Run ID: " +
                result.runId
              }
            />
          ) : null}
          {verification ? (
            <Notice
              success={verification.verified}
              text={
                verification.verified
                  ? "Firebase user profiles verified exactly: " +
                    verification.actual +
                    " / " +
                    verification.expected
                  : "Verification found differences: " +
                    verification.mismatches.join(" ")
              }
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Input({
  label,
  type,
  value,
  onChange
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 outline-none focus:border-cyan-400"
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  );
}

function ActionButton({
  busy,
  label,
  children
}: {
  busy: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 font-bold text-slate-950 disabled:opacity-60"
      disabled={busy}
      type="submit"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
      {label}
    </button>
  );
}

function Progress({ progress }: { progress: UserMigrationProgress }) {
  const width = progress.total
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  return (
    <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4">
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-semibold text-cyan-100">{progress.label}</span>
        <span className="text-cyan-200">
          {progress.current}/{progress.total}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-cyan-400 transition-[width]"
          style={{ width: width + "%" }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-900 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function Notice({ success, text }: { success: boolean; text: string }) {
  return (
    <div
      className={
        "m-6 flex gap-3 rounded-xl border p-4 text-sm sm:m-8 " +
        (success
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
          : "border-rose-400/30 bg-rose-400/10 text-rose-100")
      }
      role={success ? "status" : "alert"}
    >
      {success ? (
        <CheckCircle2 className="h-5 w-5 shrink-0" />
      ) : (
        <TriangleAlert className="h-5 w-5 shrink-0" />
      )}
      <p className="break-words">{text}</p>
    </div>
  );
}
