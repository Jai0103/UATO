"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  fetchGoogleUsers,
  postToGoogle,
  saveGoogleUsers,
} from "@/lib/google-api";
import type { ManagedUser } from "@/lib/user-storage";
import {
  CheckCircle2,
  KeyRound,
  Mail,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UserX,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type UserRole = "admin" | "trainer";

type ManagedUserWithStatus = ManagedUser & {
  accountStatus?: "active" | "inactive";
  passwordUpdatedAt?: string;
};

type CreateUserForm = {
  name: string;
  email: string;
  role: UserRole;
};

const emptyForm: CreateUserForm = {
  name: "",
  email: "",
  role: "trainer",
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createBootstrapPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 1_000_000);
    }
  }

  return `UAPL-${Array.from(bytes)
    .map((value) => alphabet[value % alphabet.length])
    .join("")}`;
}

function accountStatus(user: ManagedUserWithStatus) {
  return user.accountStatus === "inactive" ? "inactive" : "active";
}

export default function UsersPage() {
  const message = useAppMessage();
  const [users, setUsers] = useState<ManagedUserWithStatus[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState<CreateUserForm>(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [operationLabel, setOperationLabel] = useState("");

  async function loadUsers(showLoader = true) {
    if (showLoader) setLoading(true);

    try {
      const latestUsers = await fetchGoogleUsers();
      setUsers((latestUsers || []) as ManagedUserWithStatus[]);
    } catch (error) {
      message.notify({
        type: "error",
        title: "Users could not be loaded",
        message:
          error instanceof Error
            ? error.message
            : "Check the Apps Script deployment and try again.",
      });
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesStatus =
        statusFilter === "all" || accountStatus(user) === statusFilter;
      const matchesQuery =
        !cleanQuery ||
        [user.name, user.email, user.role, accountStatus(user)]
          .join(" ")
          .toLowerCase()
          .includes(cleanQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, users]);

  const activeCount = users.filter(
    (user) => accountStatus(user) === "active"
  ).length;
  const inactiveCount = users.length - activeCount;
  const trainerCount = users.filter((user) => user.role === "trainer").length;
  const adminCount = users.filter((user) => user.role === "admin").length;

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();

    if (!name || !email) {
      message.notify({
        type: "error",
        title: "Missing information",
        message: "Enter the user name and email address.",
      });
      return;
    }

    const duplicate = users.some(
      (user) =>
        user.email.trim().toLowerCase() === email ||
        user.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      message.notify({
        type: "error",
        title: "User already exists",
        message: "The same name or email is already registered.",
      });
      return;
    }

    setOperationLabel("Creating user and sending email...");

    try {
      const newUser: ManagedUserWithStatus = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        name,
        email,
        role: form.role,
        temporaryPassword: createBootstrapPassword(),
        createdAt: new Date().toISOString(),
        passwordChangedAt: "",
        accountStatus: "active",
      };

      await saveGoogleUsers([...users, newUser]);

      await postToGoogle<{ message?: string }>({
        action: "forgotPassword",
        identifier: email,
        purpose: "new-account",
      });

      await loadUsers(false);
      setForm(emptyForm);
      setCreateOpen(false);

      message.notify({
        type: "success",
        title: "User created",
        message: `A temporary password was emailed to ${email}.`,
      });
    } catch (error) {
      await loadUsers(false);
      message.notify({
        type: "error",
        title: "User creation failed",
        message:
          error instanceof Error
            ? error.message
            : "The account could not be created.",
      });
    } finally {
      setOperationLabel("");
    }
  }

  async function changeStatus(user: ManagedUserWithStatus) {
    const currentStatus = accountStatus(user);
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    const confirmed =
      nextStatus === "inactive"
        ? await message.confirm({
            title: "Deactivate user?",
            message: `${user.name} will no longer be able to sign in.`,
            confirmLabel: "Deactivate",
            variant: "danger",
          })
        : await message.confirm({
            title: "Activate user?",
            message: `${user.name} will be allowed to sign in again.`,
            confirmLabel: "Activate",
          });

    if (!confirmed) return;
    setOperationLabel(
      nextStatus === "inactive" ? "Deactivating user..." : "Activating user..."
    );

    try {
      await postToGoogle<{ userId: string; status: string; message?: string }>({
        action: "setUserAccountStatusWithAudit",
        userId: user.id,
        status: nextStatus,
      });

      await loadUsers(false);

      message.notify({
        type: "success",
        title: nextStatus === "inactive" ? "User deactivated" : "User activated",
        message: `${user.name} is now ${nextStatus}.`,
      });
    } catch (error) {
      await loadUsers(false);
      message.notify({
        type: "error",
        title: "Status update failed",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setOperationLabel("");
    }
  }

  async function resetPassword(user: ManagedUserWithStatus) {
    const confirmed = await message.confirm({
      title: "Reset password?",
      message: `A new temporary password will be sent to ${user.email}.`,
      confirmLabel: "Reset and email",
    });

    if (!confirmed) return;
    setOperationLabel("Resetting password and sending email...");

    try {
      await postToGoogle<{ message?: string }>({
        action: "forgotPassword",
        identifier: user.email,
        purpose: "password-reset",
      });

      await loadUsers(false);
      message.notify({
        type: "success",
        title: "Temporary password sent",
        message: user.email,
      });
    } catch (error) {
      message.notify({
        type: "error",
        title: "Password reset failed",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setOperationLabel("");
    }
  }

  async function deleteUser(user: ManagedUserWithStatus) {
    const confirmed = await message.confirm({
      title: "Delete user?",
      message: `${user.name} will be permanently removed from the Users database.`,
      confirmLabel: "Delete",
      variant: "danger",
    });

    if (!confirmed) return;
    setOperationLabel("Deleting user...");

    try {
      await saveGoogleUsers(users.filter((item) => item.id !== user.id));
      await loadUsers(false);

      message.notify({
        type: "success",
        title: "User deleted",
        message: `${user.name} was removed and recorded in Audit History.`,
      });
    } catch (error) {
      await loadUsers(false);
      message.notify({
        type: "error",
        title: "User deletion failed",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setOperationLabel("");
    }
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading users..." /> : null}
      {operationLabel ? <LoadingOverlay label={operationLabel} /> : null}

      <div className="app-page mx-auto w-full max-w-[1600px]">
        <section className="app-card relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-indigo-600" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <ShieldCheck size={14} /> Administrator Access
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">Users</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">Manage access, roles, account status, and password delivery for {users.length} registered accounts.</p>
            </div>

            <button type="button" onClick={() => setCreateOpen(true)} className="app-button-primary justify-center">
              <Plus size={17} /> Add User
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric label="Active" value={activeCount} icon={<CheckCircle2 size={19} />} color="text-emerald-600 bg-emerald-50" />
          <Metric label="Inactive" value={inactiveCount} icon={<UserX size={19} />} color="text-rose-600 bg-rose-50" />
          <Metric label="Trainers" value={trainerCount} icon={<Users size={19} />} color="text-sky-700 bg-sky-50" />
          <Metric label="Administrators" value={adminCount} icon={<ShieldCheck size={19} />} color="text-indigo-700 bg-indigo-50" />
        </section>

        <section className="app-card">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_auto] md:items-end">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Search users</span>
              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 shadow-sm transition focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-100">
                <Search size={17} className="text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 md:text-sm" placeholder="Name, email, role, or status" />
              </div>
            </label>
            <label className="block"><span className="text-sm font-medium text-slate-700">Account status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")} className="app-input mt-2"><option value="all">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <button type="button" disabled={!query && statusFilter === "all"} onClick={() => { setQuery(""); setStatusFilter("all"); }} className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-40"><X size={16} /> Clear</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-200 lg:hidden">
            {filteredUsers.map((user) => (
              <article key={user.id} className={`p-4 ${accountStatus(user) === "inactive" ? "bg-slate-50/70" : "bg-white"}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><UserRound size={19} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-950">{user.name}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                  <StatusBadge status={accountStatus(user)} />
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                  <span className="capitalize text-slate-600">{user.role}</span>
                  <span className="text-slate-500">{formatDate(user.createdAt)}</span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-xs font-medium text-slate-500">Account actions</span>
                  <div className="flex gap-2">
                  <IconButton label="Reset password" onClick={() => void resetPassword(user)}><KeyRound size={17} /></IconButton>
                  <IconButton label={accountStatus(user) === "active" ? "Deactivate user" : "Activate user"} danger={accountStatus(user) === "active"} active={accountStatus(user) === "inactive"} onClick={() => void changeStatus(user)}><Power size={17} /></IconButton>
                  <IconButton label="Delete user" danger onClick={() => void deleteUser(user)}><Trash2 size={17} /></IconButton>
                  </div>
                </div>
              </article>
            ))}

            {!filteredUsers.length && !loading ? <div className="p-10 text-center text-sm text-slate-500">No users found.</div> : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><th className="px-5 py-3 font-semibold">User</th><th className="px-5 py-3 font-semibold">Role</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Created</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="px-5 py-4"><p className="font-semibold text-slate-950">{user.name}</p><p className="mt-0.5 text-xs text-slate-500">{user.email}</p></td>
                    <td className="px-5 py-4 capitalize text-slate-700">{user.role}</td>
                    <td className="px-5 py-4"><StatusBadge status={accountStatus(user)} /></td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton label="Reset password" onClick={() => void resetPassword(user)}><KeyRound size={16} /></IconButton><IconButton label={accountStatus(user) === "active" ? "Deactivate user" : "Activate user"} danger={accountStatus(user) === "active"} active={accountStatus(user) === "inactive"} onClick={() => void changeStatus(user)}><Power size={16} /></IconButton><IconButton label="Delete user" danger onClick={() => void deleteUser(user)}><Trash2 size={16} /></IconButton></div></td>
                  </tr>
                ))}
                {!filteredUsers.length && !loading ? <tr><td colSpan={5} className="p-10 text-center text-slate-500">No users found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full overflow-hidden rounded-t-lg bg-white shadow-2xl sm:max-w-lg sm:rounded-lg">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><UserRound size={19} /></div><div><h2 className="text-lg font-semibold text-slate-950">Add User</h2><p className="mt-0.5 text-sm text-slate-500">Create a secure administrator or trainer account.</p></div></div><button type="button" onClick={() => setCreateOpen(false)} className="app-icon-button" aria-label="Close"><X size={18} /></button></div>
            <form onSubmit={createUser} className="space-y-4 p-5">
              <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"><Mail size={18} className="mt-0.5 shrink-0 text-sky-700" /><p>A temporary password and sign-in link will be emailed automatically after the account is created.</p></div>
              <FormInput label="Full name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Trainer name" />
              <FormInput label="Email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="name@example.com" type="email" />
              <label className="block"><span className="text-sm font-medium text-slate-700">Role</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))} className="app-input mt-2"><option value="trainer">Trainer</option><option value="admin">Administrator</option></select></label>
              <div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={() => setCreateOpen(false)} className="app-button-secondary justify-center">Cancel</button><button type="submit" className="app-button-primary justify-center"><Plus size={16} /> Create</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Metric({ label, value, icon, color }: { label: string; value: number; icon: ReactNode; color: string }) {
  return <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>{icon}</div></div>;
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status === "active" ? "Active" : "Inactive"}</span>;
}

function IconButton({ label, children, onClick, danger = false, active = false }: { label: string; children: ReactNode; onClick: () => void; danger?: boolean; active?: boolean }) {
  const color = danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : active ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-600 hover:bg-slate-100";
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${color}`}>{children}</button>;
}

function FormInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="app-input mt-2" placeholder={placeholder} required /></label>;
}
