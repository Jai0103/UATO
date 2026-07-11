"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  getManagedUsers,
  saveManagedUsers,
  type ManagedUser,
} from "@/lib/user-storage";
import { fetchGoogleUsers, saveGoogleUsers } from "@/lib/google-api";

type UserRole = "admin" | "trainer";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwjmTFIGbGSHhaxj9ds86l5_Vgx6vuovgQZpfNRSexZH5T336eLEylJiWoKaPkAkHnZPg/exec";

type UserForm = {
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
};

const emptyForm: UserForm = {
  name: "",
  email: "",
  role: "trainer",
  temporaryPassword: "",
};

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "UAPL-";

  for (let index = 0; index < 8; index += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}

function formatDate(value: string) {
  if (!value) return "Not yet";

  try {
    return new Intl.DateTimeFormat("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function UsersPage() {
  const message = useAppMessage();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<UserForm>({
    ...emptyForm,
    temporaryPassword: generateTemporaryPassword(),
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);

      try {
        const googleUsers = await fetchGoogleUsers();

        if (googleUsers.length > 0) {
          setUsers(googleUsers);
          saveManagedUsers(googleUsers);
          return;
        }

        setUsers(getManagedUsers());
      } catch {
        setUsers(getManagedUsers());
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) return users;

    return users.filter((user) => {
      return (
        user.name.toLowerCase().includes(cleanQuery) ||
        user.email.toLowerCase().includes(cleanQuery) ||
        user.role.toLowerCase().includes(cleanQuery)
      );
    });
  }, [query, users]);

  const adminCount = users.filter((user) => user.role === "admin").length;
  const trainerCount = users.filter((user) => user.role === "trainer").length;
  const temporaryCount = users.filter((user) => !user.passwordChangedAt).length;

  async function syncUsers(nextUsers: ManagedUser[], successMessage: string) {
    setSaving(true);

    try {
      saveManagedUsers(nextUsers);
      setUsers(nextUsers);
      await saveGoogleUsers(nextUsers);

      message.notify({
        type: "success",
        title: successMessage,
      });
    } catch {
      saveManagedUsers(nextUsers);
      setUsers(nextUsers);

      message.notify({
        type: "info",
        title: "Saved locally",
        message:
          "Google Sheets sync failed, so please check the Apps Script deployment.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim().toLowerCase();
    const cleanPassword = form.temporaryPassword.trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      message.notify({
        type: "error",
        title: "Missing information",
        message: "Please complete the name, email, and temporary password.",
      });
      return;
    }

    const alreadyExists = users.some((user) => {
      return (
        user.email.trim().toLowerCase() === cleanEmail ||
        user.name.trim().toLowerCase() === cleanName.toLowerCase()
      );
    });

    if (alreadyExists) {
      message.notify({
        type: "error",
        title: "User already exists",
        message: "A user with the same name or email already exists.",
      });
      return;
    }

    const newUser: ManagedUser = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()),
      name: cleanName,
      email: cleanEmail,
      role: form.role,
      temporaryPassword: cleanPassword,
      createdAt: new Date().toISOString(),
      passwordChangedAt: "",
    };

    await syncUsers([...users, newUser], "User created successfully.");

    setForm({
      ...emptyForm,
      temporaryPassword: generateTemporaryPassword(),
    });
    setIsCreateOpen(false);
  }

  async function handleDeleteUser(user: ManagedUser) {
    const confirmed = await message.confirm({
      title: "Delete user?",
      message: `This will remove ${user.name} from the Users database.`,
      confirmLabel: "Delete",
      variant: "danger",
    });

    if (!confirmed) return;

    await syncUsers(
      users.filter((item) => item.id !== user.id),
      "User deleted successfully."
    );
  }

  async function handleResetPassword(user: ManagedUser) {
    const confirmed = await message.confirm({
      title: "Reset password?",
      message: `A temporary password will be emailed to ${user.email}. The user will need to change it after login.`,
      confirmLabel: "Reset and email",
    });

    if (!confirmed) return;

    setSaving(true);

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "forgotPassword",
          identifier: user.email,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        message.notify({
          type: "error",
          title: "Password reset failed",
          message: result.message || "Please try again.",
        });
        return;
      }

      const latestUsers = await fetchGoogleUsers();
      setUsers(latestUsers);
      saveManagedUsers(latestUsers);

      message.notify({
        type: "success",
        title: "Temporary password sent by email.",
      });
    } catch {
      message.notify({
        type: "error",
        title: "Unable to reset password",
        message: "Please check Apps Script email permission.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="app-page space-y-5">
        <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-xl shadow-slate-200/60 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-100">
                <Shield className="h-3.5 w-3.5" />
                Admin Control
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                User Management
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Create accounts, monitor password status, and reset temporary
                passwords for trainers and administrators.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setForm({
                  ...emptyForm,
                  temporaryPassword: generateTemporaryPassword(),
                });
                setIsCreateOpen(true);
              }}
              className="app-button-primary w-full justify-center bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="app-card p-4">
            <p className="text-sm font-medium text-slate-500">Total Users</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {users.length}
            </p>
          </div>

          <div className="app-card p-4">
            <p className="text-sm font-medium text-slate-500">Trainers</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {trainerCount}
            </p>
          </div>

          <div className="app-card p-4">
            <p className="text-sm font-medium text-slate-500">
              Temporary Passwords
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {temporaryCount}
            </p>
          </div>
        </section>

        <section className="app-card overflow-hidden">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Accounts</h2>
                <p className="text-sm text-slate-500">
                  {adminCount} admin, {trainerCount} trainer
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="app-input min-w-0 pl-10 sm:w-72"
                    placeholder="Search users"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowPasswords((value) => !value)}
                  className="app-button-secondary justify-center"
                >
                  {showPasswords ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {showPasswords ? "Hide" : "Show"} Passwords
                </button>
              </div>
            </div>
          </div>

          <div className="block divide-y divide-slate-200 lg:hidden">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <article key={user.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                          <UserRound className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-bold text-slate-950">
                            {user.name}
                          </h3>
                          <p className="truncate text-sm text-slate-500">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700">
                      {user.role}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Password status</span>
                      <span
                        className={
                          user.passwordChangedAt
                            ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"
                            : "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700"
                        }
                      >
                        {user.passwordChangedAt ? "Changed" : "Temporary"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Password</span>
                      <span className="font-semibold text-slate-900">
                        {showPasswords ? user.temporaryPassword : "********"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Changed</span>
                      <span className="text-right font-medium text-slate-700">
                        {formatDate(user.passwordChangedAt || "")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user)}
                      className="app-button-secondary justify-center"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Reset
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  No users found.
                </p>
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    User
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    Role
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    Password Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    Temporary Password
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    Created
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                            <UserRound className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-950">
                              {user.name}
                            </p>
                            <p className="text-sm text-slate-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700">
                          {user.role}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            user.passwordChangedAt
                              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"
                              : "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700"
                          }
                        >
                          {user.passwordChangedAt ? "Changed" : "Temporary"}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-800">
                        {showPasswords ? user.temporaryPassword : "********"}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {formatDate(user.createdAt)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleResetPassword(user)}
                            className="app-icon-button"
                            title="Reset password"
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            className="app-danger-icon-button"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center">
                      <Users className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        No users found.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[28px] bg-white shadow-2xl">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-bold text-slate-950">Add User</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create an admin or trainer account.
              </p>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 p-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Full name
                </span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="app-input"
                  placeholder="Trainer name"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Email
                </span>
                <input
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="app-input"
                  placeholder="name@example.com"
                  type="email"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Role
                </span>
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as UserRole,
                    }))
                  }
                  className="app-input"
                >
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Temporary password
                </span>
                <div className="flex gap-2">
                  <input
                    value={form.temporaryPassword}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        temporaryPassword: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="Temporary password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        temporaryPassword: generateTemporaryPassword(),
                      }))
                    }
                    className="app-icon-button h-12 w-12 shrink-0"
                    title="Generate password"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                </div>
              </label>

              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                After the user logs in with this temporary password, the system
                will ask them to create a new password.
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="app-button-secondary justify-center"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="app-button-primary justify-center"
                >
                  <Plus className="h-4 w-4" />
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {loading ? <LoadingOverlay label="Loading users..." /> : null}
      {saving ? <LoadingOverlay label="Updating users..." /> : null}
    </AppShell>
  );
}
