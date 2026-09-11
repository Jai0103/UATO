"use client";

import { FirebaseError } from "firebase/app";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, Database, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { firebaseAuth, firestore } from "@/lib/firebase-client";

type TestResult = {
  name: string;
  email: string;
  role: string;
  status: string;
  uid: string;
};

function friendlyFirebaseError(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : "Firebase connection test failed.";
  }

  if (error.code === "auth/invalid-credential") {
    return "The Firebase email or password is incorrect.";
  }

  if (error.code === "auth/too-many-requests") {
    return "Too many attempts. Wait a moment before trying again.";
  }

  if (error.code === "permission-denied") {
    return "Authentication succeeded, but Firestore denied access. Check the user document ID and published rules.";
  }

  return `${error.message} (${error.code})`;
}

export default function FirebaseTestPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

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
        throw new Error(
          "Firebase login succeeded, but no matching users document was found for this User UID."
        );
      }

      const profile = profileSnapshot.data();
      setResult({
        name: String(profile.name || "Not set"),
        email: String(profile.email || credential.user.email || "Not set"),
        role: String(profile.role || "Not set"),
        status: String(profile.status || "Not set"),
        uid: credential.user.uid
      });
    } catch (testError) {
      setError(friendlyFirebaseError(testError));
    } finally {
      if (firebaseAuth.currentUser) {
        await signOut(firebaseAuth).catch(() => undefined);
      }
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <Database aria-hidden="true" className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-cyan-300">
              Migration diagnostic
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Firebase connection test
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This checks Firebase Authentication and your private Firestore user profile. It does not change the live application login.
            </p>
          </header>

          <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={runTest}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Firebase email</span>
              <input
                autoComplete="username"
                className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-base text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Firebase test password</span>
              <input
                autoComplete="current-password"
                className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-base text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              )}
              {loading ? "Testing Firebase..." : "Run connection test"}
            </button>

            {error ? (
              <div className="flex gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100" role="alert">
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
                <p>{error}</p>
              </div>
            ) : null}

            {result ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <div className="flex items-center gap-2 font-bold text-emerald-200">
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                  Firebase connection successful
                </div>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-400">Name</dt>
                  <dd className="min-w-0 break-words text-white">{result.name}</dd>
                  <dt className="text-slate-400">Email</dt>
                  <dd className="min-w-0 break-words text-white">{result.email}</dd>
                  <dt className="text-slate-400">Role</dt>
                  <dd className="text-white">{result.role}</dd>
                  <dt className="text-slate-400">Status</dt>
                  <dd className="text-white">{result.status}</dd>
                  <dt className="text-slate-400">UID</dt>
                  <dd className="min-w-0 break-all font-mono text-xs text-slate-300">{result.uid}</dd>
                </dl>
              </div>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}
