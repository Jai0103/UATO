"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { fetchGoogleUsers, saveGoogleUsers } from "@/lib/google-api";
import {
  createManagedUser,
  getManagedUsers,
  saveManagedUsers,
  type ManagedUser
} from "@/lib/user-storage";
import { Eye, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type UserForm = {
  name: string;
  email: string;
  role: "admin" | "trainer";
  temporaryPassword: string;
};

const emptyForm: UserForm = {
  name: "",
  email: "",
  role: "trainer",
  temporaryPassword: ""
};

function generateTemporaryPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$";
  let password = "";

  for (let index = 0; index < 10; index += 1) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  return password;
}

export default function UsersPage() {
  const { notify, confirm } = useAppMessage();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [visiblePasswordId, setVisiblePasswordId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);

      try {
        const googleUsers = await fetchGoogleUsers();
        setUsers(googleUsers);
        saveManagedUsers(googleUsers);
      } catch {
        setUsers(getManagedUsers());
        notify({
          type: "warning",
          title: "Using local users",
          message: "Google Sheets users could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [notify]);

  function openCreateModal() {
    setForm({
      ...emptyForm,
      temporaryPassword: generateTemporaryPassword()
    });
    setModalOpen(true);
  }

  function closeCreateModal() {
    setModalOpen(false);
    setForm(emptyForm);
  }

  function updateForm(field: keyof UserForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function syncUsers(updatedUsers: ManagedUser[]) {
    setSaving(true);

    try {
      const googleUsers = await saveGoogleUsers(updatedUsers);
      setUsers(googleUsers);
      saveManagedUsers(googleUsers);
      return true;
    } catch {
      setUsers(updatedUsers);
      saveManagedUsers(updatedUsers);
      notify({
        type: "error",
        title: "Google Sheets sync failed",
        message: "User changes were saved locally on this device."
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveUser() {
    if (!form.name.trim()) {
      notify({
        type: "warning",
        title: "Name required",
        message: "Enter the user's full name."
      });
      return;
    }

    if (!form.email.trim()) {
      notify({
        type: "warning",
        title: "Email required",
        message: "Enter the user's email address."
      });
      return;
    }

    if (!form.temporaryPassword.trim()) {
      notify({
        type: "warning",
        title: "Password required",
        message: "Enter or generate a temporary password."
      });
      return;
    }

    const exists = users.some(
      (user) => user.email.toLowerCase() === form.email.toLowerCase()
    );

    if (exists) {
      notify({
        type: "warning",
        title: "User already exists",
        message: "A user with this email already exists."
      });
      return;
    }

    const newUser = createManagedUser(form);
    const updatedUsers = [newUser, ...users];

    const synced = await syncUsers(updatedUsers);
    closeCreateModal();

    notify({
      type: synced ? "success" : "warning",
      title: synced ? "User created" : "User created locally",
      message: `${newUser.name} was added as ${newUser.role}.`
    });
  }

  async function deleteUser(user: ManagedUser) {
    const confirmed = await confirm({
      title: "Delete user?",
      message: `Remove ${user.name} from the user list?`,
      confirmLabel: "Delete",
      variant: "danger"
    });

    if (!confirmed) return;

    const updatedUsers = users.filter((item) => item.id !== user.id);
    const synced = await syncUsers(updatedUsers);

    notify({
      type: synced ? "success" : "warning",
      title: synced ? "User deleted" : "User deleted locally",
      message: `${user.name} was removed.`
    });
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading users..." /> : null}
      {saving ? <LoadingOverlay label="Saving users..." /> : null}

      <div className="w-full max-w-none space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Users</h1>
            <p className="mt-1 text-sm text-slate-500">
              Create and manage admin and trainer access.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <UserPlus size={17} />
            Create User
          </button>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Temporary Password</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {user.name}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{user.email}</td>
                    <td className="px-4 py-4 capitalize text-slate-700">
                      {user.role}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        {visiblePasswordId === user.id
                          ? user.temporaryPassword
                          : "**********"}
                        <button
                          onClick={() =>
                            setVisiblePasswordId((current) =>
                              current === user.id ? "" : user.id
                            )
                          }
                          className="text-slate-400 hover:text-slate-700"
                          aria-label="Toggle password visibility"
                        >
                          <Eye size={15} />
                        </button>
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {user.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => deleteUser(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete user"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}

                {!users.length && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No users created yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full rounded-t-xl bg-white shadow-2xl sm:max-w-xl sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Create User
                </h2>
                <p className="text-sm text-slate-500">
                  Set the account details and temporary password.
                </p>
              </div>

              <button
                onClick={closeCreateModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Close create user modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5">
              <label>
                <span className="text-sm font-medium text-slate-700">Full Name</span>
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                  placeholder="Trainer name"
                />
              </label>

              <label>
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                  placeholder="trainer@example.com"
                />
              </label>

              <label>
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  value={form.role}
                  onChange={(event) =>
                    updateForm("role", event.target.value as "admin" | "trainer")
                  }
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-blue"
                >
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label>
                <span className="text-sm font-medium text-slate-700">
                  Temporary Password
                </span>
                <div className="mt-2 flex gap-2">
                  <input
                    value={form.temporaryPassword}
                    onChange={(event) =>
                      updateForm("temporaryPassword", event.target.value)
                    }
                    className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                  />
                  <button
                    onClick={() =>
                      updateForm("temporaryPassword", generateTemporaryPassword())
                    }
                    className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    type="button"
                  >
                    Generate
                  </button>
                </div>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
              <button
                onClick={closeCreateModal}
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={saveUser}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                Create User
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
