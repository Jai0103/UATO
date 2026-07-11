"use client";

import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { sessionKey, type UserRole } from "@/lib/demo-auth";
import { fetchGoogleUsers, saveGoogleUsers } from "@/lib/google-api";
import { getManagedUsers, saveManagedUsers } from "@/lib/user-storage";
import { ArrowRight, Lock, Plane, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Session = {
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword?: boolean;
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const { notify } = useAppMessage();

  const [session, setSession] = useState<Session | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const rawSession = localStorage.getItem(sessionKey);

    if (!rawSession) {
      router.replace("/");
      return;
    }

    try {
      setSession(JSON.parse(rawSession) as Session);
    } catch {
      localStorage.removeItem(sessionKey);
      router.replace("/");
    }
  }, [router]);

  async function loadUsers() {
    try {
      const googleUsers = await fetchGoogleUsers();
      saveManagedUsers(googleUsers);
      return googleUsers;
    } catch {
      return getManagedUsers();
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) return;

    if (!currentPassword.trim()) {
      notify({
        type: "warning",
        title: "Current password required",
        message: "Enter your current temporary password."
      });
      return;
    }

    if (newPassword.length < 8) {
      notify({
        type: "warning",
        title: "Password too short",
        message: "Use at least 8 characters for the new password."
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      notify({
        type: "warning",
        title: "Passwords do not match",
        message: "Confirm password must match the new password."
      });
      return;
    }

    if (newPassword === currentPassword) {
      notify({
        type: "warning",
        title: "Choose a new password",
        message: "The new password must be different from the current password."
      });
      return;
    }

    setSaving(true);

    try {
      const users = await loadUsers();
      const userIndex = users.findIndex(
        (user) => user.email.toLowerCase() === session.email.toLowerCase()
      );

      if (userIndex < 0) {
        notify({
          type: "error",
          title: "Account not found",
          message: "Your account could not be found in the user list."
        });
        return;
      }

      const user = users[userIndex];

      if (user.temporaryPassword !== currentPassword) {
        notify({
          type: "error",
          title: "Incorrect current password",
          message: "The current password you entered is incorrect."
        });
        return;
      }

      const updatedUsers = [...users];
      updatedUsers[userIndex] = {
        ...user,
        temporaryPassword: newPassword,
        passwordChangedAt: new Date().toISOString()
      };

      try {
        const googleUsers = await saveGoogleUsers(updatedUsers);
        saveManagedUsers(googleUsers);
      } catch {
        saveManagedUsers(updatedUsers);
        notify({
          type: "warning",
          title: "Saved locally",
          message: "Google Sheets sync failed. Password was updated locally."
        });
      }

      localStorage.setItem(
        sessionKey,
        JSON.stringify({
          name: session.name,
          email: session.email,
          role: session.role,
          mustChangePassword: false
        })
      );

      notify({
        type: "success",
        title: "Password updated",
        message: "You can now continue using the system."
      });

      router.push(session.role === "admin" ? "/admin" : "/flight-logs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-light px-4 py-8">
      {saving ? <LoadingOverlay label="Updating password..." /> : null}

      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy text-white">
            <Plane size={24} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-950">UAPL LMS</p>
            <p className="text-sm text-slate-500">Change Temporary Password</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <ShieldCheck size={20} className="shrink-0 text-amber-600" />
            <p className="text-sm leading-6 text-amber-800">
              For account security, please change your temporary password before
              continuing.
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="mt-6 space-y-5">
          <label>
            <span className="text-sm font-medium text-slate-700">
              Current Password
            </span>
            <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
              <Lock size={18} className="text-slate-400" />
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                placeholder="Enter current password"
              />
            </div>
          </label>

          <label>
            <span className="text-sm font-medium text-slate-700">
              New Password
            </span>
            <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
              <Lock size={18} className="text-slate-400" />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                placeholder="At least 8 characters"
              />
            </div>
          </label>

          <label>
            <span className="text-sm font-medium text-slate-700">
              Confirm New Password
            </span>
            <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
              <Lock size={18} className="text-slate-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                placeholder="Repeat new password"
              />
            </div>
          </label>

          <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-navy text-sm font-semibold text-white hover:bg-slate-800">
            Update Password
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </main>
  );
}
