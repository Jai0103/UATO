"use client";


import {
  FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Check,
  CircleOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Trash2,
  UserRound,
  Users
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  fetchGoogleUsers,
  googleAppsScriptUrl,
  postToGoogle,
  saveGoogleUsers
} from "@/lib/google-api";
import {
  getSecureSession
} from "@/lib/auth-api";
import {
  managedUsersKey,
  type ManagedUser
} from "@/lib/user-storage";

type UserRole =
  | "admin"
  | "trainer";

type AccountStatus =
  | "active"
  | "inactive";

type SecureManagedUser =
  ManagedUser & {
    passwordChangedAt?: string;
    passwordUpdatedAt?: string;
    accountStatus?: AccountStatus;
  };

type UserForm = {
  name: string;
  email: string;
  role: UserRole;
};

const emptyForm: UserForm = {
  name: "",
  email: "",
  role: "trainer"
};

function generateTemporaryPassword() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";

  let password = "UAPL-";

  for (
    let index = 0;
    index < 10;
    index++
  ) {
    password +=
      characters.charAt(
        Math.floor(
          Math.random() *
            characters.length
        )
      );
  }

  return password;
}

function formatDate(value?: string) {
  if (!value) return "Not yet";

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-SG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(date);
}

export default function UsersPage() {
  const message = useAppMessage();

  const [users, setUsers] =
    useState<SecureManagedUser[]>([]);

  const [query, setQuery] =
    useState("");

  const [form, setForm] =
    useState<UserForm>(emptyForm);

  const [
    isCreateOpen,
    setIsCreateOpen
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const currentSession =
    getSecureSession();

  useEffect(() => {
    /*
     * Remove old locally cached Users data
     * because it may contain plain passwords.
     */
    localStorage.removeItem(
      managedUsersKey
    );

    async function loadUsers() {
      setLoading(true);

      try {
        const googleUsers =
          await fetchGoogleUsers();

        setUsers(
          googleUsers as
            SecureManagedUser[]
        );
      } catch (error) {
        setUsers([]);

        message.notify({
          type: "error",
          title:
            "Unable to load users",
          message:
            error instanceof Error
              ? error.message
              : "The secure Users API could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [message]);

  const filteredUsers =
    useMemo(() => {
      const cleanQuery =
        query.trim().toLowerCase();

      if (!cleanQuery) {
        return users;
      }

      return users.filter(
        (user) =>
          user.name
            .toLowerCase()
            .includes(cleanQuery) ||
          user.email
            .toLowerCase()
            .includes(cleanQuery) ||
          user.role
            .toLowerCase()
            .includes(cleanQuery) ||
          (
            user.accountStatus ||
            "active"
          ).includes(cleanQuery)
      );
    }, [query, users]);

  const adminCount =
    users.filter(
      (user) =>
        user.role === "admin"
    ).length;

  const trainerCount =
    users.filter(
      (user) =>
        user.role === "trainer"
    ).length;

  const activeCount =
    users.filter(
      (user) =>
        (
          user.accountStatus ||
          "active"
        ) === "active"
    ).length;

  const temporaryCount =
    users.filter(
      (user) =>
        !user.passwordChangedAt
    ).length;

  async function refreshUsers() {
    const latestUsers =
      await fetchGoogleUsers();

    setUsers(
      latestUsers as
        SecureManagedUser[]
    );
  }

  async function saveUsersSecurely(
    nextUsers: SecureManagedUser[],
    successTitle: string,
    successMessage?: string
  ) {
    setSaving(true);

    try {
      const savedUsers =
        await saveGoogleUsers(
          nextUsers
        );

      setUsers(
        savedUsers as
          SecureManagedUser[]
      );

      message.notify({
        type: "success",
        title: successTitle,
        message: successMessage
      });

      return true;
    } catch (error) {
      message.notify({
        type: "error",
        title:
          "Unable to update users",
        message:
          error instanceof Error
            ? error.message
            : "The Users database could not be updated."
      });

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendResetEmail(
    user: SecureManagedUser
  ) {
    const response = await fetch(
      googleAppsScriptUrl,
      {
        method: "POST",
        body: JSON.stringify({
          action: "forgotPassword",
          identifier: user.email
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        "The email service returned an error."
      );
    }

    const result =
      await response.json();

    const successful =
      result.success ?? result.ok;

    if (!successful) {
      throw new Error(
        result.message ||
          "Password reset failed."
      );
    }
  }

  async function handleCreateUser(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanName =
      form.name.trim();

    const cleanEmail =
      form.email
        .trim()
        .toLowerCase();

    if (
      !cleanName ||
      !cleanEmail
    ) {
      message.notify({
        type: "warning",
        title:
          "Missing information",
        message:
          "Enter the user's full name and email."
      });

      return;
    }

    const duplicate =
      users.some(
        (user) =>
          user.email
            .trim()
            .toLowerCase() ===
            cleanEmail ||
          user.name
            .trim()
            .toLowerCase() ===
            cleanName.toLowerCase()
      );

    if (duplicate) {
      message.notify({
        type: "warning",
        title:
          "User already exists",
        message:
          "A user with the same name or email already exists."
      });

      return;
    }

    const temporaryPassword =
      generateTemporaryPassword();

    const newUser: SecureManagedUser = {
      id:
        typeof crypto !==
          "undefined" &&
        crypto.randomUUID
          ? crypto.randomUUID()
          : `user-${Date.now()}`,

      name: cleanName,
      email: cleanEmail,
      role: form.role,

      /*
       * Sent once to the server for hashing.
       * It is not returned by getUsers.
       */
      temporaryPassword,

      createdAt:
        new Date().toISOString(),

      passwordChangedAt: "",
      accountStatus: "active"
    };

    setSaving(true);

    try {
      await saveGoogleUsers([
        ...users,
        newUser
      ]);

      /*
       * Generate and email a fresh temporary
       * password through the secure reset flow.
       */
      await sendResetEmail(newUser);
      await refreshUsers();

      setForm(emptyForm);
      setIsCreateOpen(false);

      message.notify({
        type: "success",
        title:
          "User created",
        message:
          `A temporary password was emailed to ${cleanEmail}.`
      });
    } catch (error) {
      message.notify({
        type: "error",
        title:
          "Unable to create user",
        message:
          error instanceof Error
            ? error.message
            : "The user could not be created."
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(
    user: SecureManagedUser
  ) {
    const confirmed =
      await message.confirm({
        title: "Reset password?",
        message:
          `A new temporary password will be emailed to ${user.email}. All previous sessions for this account should be considered invalid.`,
        confirmLabel:
          "Reset and email"
      });

    if (!confirmed) return;

    setSaving(true);

    try {
      await sendResetEmail(user);
      await refreshUsers();

      message.notify({
        type: "success",
        title:
          "Temporary password sent",
        message:
          `A new temporary password was emailed to ${user.email}.`
      });
    } catch (error) {
      message.notify({
        type: "error",
        title:
          "Password reset failed",
        message:
          error instanceof Error
            ? error.message
            : "The reset email could not be sent."
      });
    } finally {
      setSaving(false);
    }
  }

 async function toggleUserStatus(
  user: SecureManagedUser
) {
  const currentStatus =
    user.accountStatus ||
    "active";

  const nextStatus:
    AccountStatus =
    currentStatus === "active"
      ? "inactive"
      : "active";

  const isCurrentUser =
    currentSession?.email
      .trim()
      .toLowerCase() ===
    user.email
      .trim()
      .toLowerCase();

  if (
    isCurrentUser &&
    nextStatus === "inactive"
  ) {
    message.notify({
      type: "warning",
      title:
        "Action not allowed",
      message:
        "You cannot deactivate your own account."
    });

    return;
  }

  const confirmed =
    await message.confirm({
      title:
        nextStatus === "inactive"
          ? "Deactivate user?"
          : "Activate user?",
      message:
        nextStatus === "inactive"
          ? `${user.name} will be signed out and prevented from signing in.`
          : `${user.name} will be allowed to sign in again.`,
      confirmLabel:
        nextStatus === "inactive"
          ? "Deactivate"
          : "Activate",
      variant:
        nextStatus === "inactive"
          ? "danger"
          : "default"
    });

  if (!confirmed) return;

  setSaving(true);

  try {
    await postToGoogle<{
      userId: string;
      status: AccountStatus;
    }>({
      action:
        "setUserAccountStatus",
      userId: user.id,
      status: nextStatus
    });

    await refreshUsers();

    message.notify({
      type: "success",
      title:
        nextStatus === "active"
          ? "User activated"
          : "User deactivated",
      message:
        `${user.name} is now ${nextStatus}.`
    });
  } catch (error) {
    message.notify({
      type: "error",
      title:
        "Status update failed",
      message:
        error instanceof Error
          ? error.message
          : "The account status could not be updated."
    });
  } finally {
    setSaving(false);
  }
}

  async function handleDeleteUser(
    user: SecureManagedUser
  ) {
    const isCurrentUser =
      currentSession?.email
        .trim()
        .toLowerCase() ===
      user.email
        .trim()
        .toLowerCase();

    if (isCurrentUser) {
      message.notify({
        type: "warning",
        title:
          "Action not allowed",
        message:
          "You cannot delete your own account."
      });

      return;
    }

    if (
      user.role === "admin" &&
      adminCount <= 1
    ) {
      message.notify({
        type: "warning",
        title:
          "Admin required",
        message:
          "The final administrator account cannot be deleted."
      });

      return;
    }

    const confirmed =
      await message.confirm({
        title: "Delete user?",
        message:
          `Delete ${user.name}? This removes their account but does not delete their existing flight records.`,
        confirmLabel: "Delete",
        variant: "danger"
      });

    if (!confirmed) return;

    await saveUsersSecurely(
      users.filter(
        (item) =>
          item.id !== user.id
      ),
      "User deleted",
      `${user.name} was removed.`
    );
  }

  return (
    <AppShell>
      {loading ? (
        <LoadingOverlay label="Loading users..." />
      ) : null}

      {saving ? (
        <LoadingOverlay label="Updating users..." />
      ) : null}

      <div className="app-page space-y-5">
        <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-lg sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-sky-100">
                <Shield className="h-3.5 w-3.5" />
                Admin Control
              </div>

              <h1 className="text-2xl font-bold sm:text-3xl">
                User Management
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Manage secure admin and trainer accounts. Passwords are never displayed or returned by the API.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setForm(emptyForm);
                setIsCreateOpen(true);
              }}
              className="app-button-primary w-full justify-center bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Total Users"
            value={users.length}
          />

          <Stat
            label="Active"
            value={activeCount}
          />

          <Stat
            label="Trainers"
            value={trainerCount}
          />

          <Stat
            label="Temporary"
            value={temporaryCount}
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Accounts
                </h2>

                <p className="text-sm text-slate-500">
                  {adminCount} admin,{" "}
                  {trainerCount} trainer
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value
                    )
                  }
                  className="app-input min-w-0 pl-10 sm:w-72"
                  placeholder="Search users"
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 lg:hidden">
            {filteredUsers.map(
              (user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  onReset={() =>
                    handleResetPassword(
                      user
                    )
                  }
                  onStatus={() =>
                    toggleUserStatus(user)
                  }
                  onDelete={() =>
                    handleDeleteUser(user)
                  }
                />
              )
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <Header>User</Header>
                  <Header>Role</Header>
                  <Header>Status</Header>
                  <Header>
                    Password
                  </Header>
                  <Header>Created</Header>

                  <th className="px-5 py-3 text-right text-xs font-bold uppercase text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(
                  (user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-5 py-4">
                        <UserIdentity
                          user={user}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <RoleLabel
                          role={user.role}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <StatusLabel
                          status={
                            user.accountStatus ||
                            "active"
                          }
                        />
                      </td>

                      <td className="px-5 py-4">
                        <PasswordLabel
                          changed={
                            Boolean(
                              user.passwordChangedAt
                            )
                          }
                        />
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {formatDate(
                          user.createdAt
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <IconButton
                            label="Reset password"
                            onClick={() =>
                              handleResetPassword(
                                user
                              )
                            }
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </IconButton>

                          <IconButton
                            label={
                              (
                                user.accountStatus ||
                                "active"
                              ) === "active"
                                ? "Deactivate user"
                                : "Activate user"
                            }
                            onClick={() =>
                              toggleUserStatus(
                                user
                              )
                            }
                          >
                            {(
                              user.accountStatus ||
                              "active"
                            ) === "active" ? (
                              <CircleOff className="h-4 w-4" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </IconButton>

                          <IconButton
                            label="Delete user"
                            danger
                            onClick={() =>
                              handleDeleteUser(
                                user
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {!filteredUsers.length &&
          !loading ? (
            <div className="px-5 py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-slate-300" />

              <p className="mt-3 text-sm font-semibold text-slate-700">
                No users found.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() =>
              !saving &&
              setIsCreateOpen(false)
            }
            aria-label="Close dialog"
          />

          <form
            onSubmit={
              handleCreateUser
            }
            className="relative z-10 w-full rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-lg"
          >
            <h2 className="text-xl font-bold text-slate-950">
              Add User
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              The temporary password will be generated securely and emailed to the user.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Full name
                </span>

                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name:
                        event.target.value
                    })
                  }
                  className="app-input"
                  placeholder="Trainer name"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Email
                </span>

                <input
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email:
                        event.target.value
                    })
                  }
                  className="app-input"
                  placeholder="name@example.com"
                  type="email"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Role
                </span>

                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      role:
                        event.target
                          .value as UserRole
                    })
                  }
                  className="app-input"
                >
                  <option value="trainer">
                    Trainer
                  </option>

                  <option value="admin">
                    Admin
                  </option>
                </select>
              </label>

              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-800">
                <div className="flex gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0" />

                  <p>
                    The password will not be shown to the administrator. It will be sent directly to the registered email.
                  </p>
                </div>
              </div>
            </div>
{saving ? (
  <div className="mt-5 flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
    Creating the account and sending the temporary password...
  </div>
) : null}
            

            <div className="mt-7 grid grid-cols-2 gap-3">
              <button
  type="submit"
  disabled={saving}
  className="app-button-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
>
  {saving ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Plus className="h-4 w-4" />
  )}

  {saving
    ? "Creating and emailing..."
    : "Create User"}
</button>

              <button
                type="submit"
                className="app-button-primary justify-center"
              >
                <Plus className="h-4 w-4" />
                Create User
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function Stat({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function UserIdentity({
  user
}: {
  user: SecureManagedUser;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
        <UserRound className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <p className="truncate font-bold text-slate-950">
          {user.name}
        </p>

        <p className="truncate text-sm text-slate-500">
          {user.email}
        </p>
      </div>
    </div>
  );
}

function Header({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-5 py-3 text-left text-xs font-bold uppercase text-slate-500">
      {children}
    </th>
  );
}

function RoleLabel({
  role
}: {
  role: UserRole;
}) {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-700">
      {role}
    </span>
  );
}

function StatusLabel({
  status
}: {
  status: AccountStatus;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold capitalize ${
        status === "active"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : "bg-slate-400"
        }`}
      />

      {status}
    </span>
  );
}

function PasswordLabel({
  changed
}: {
  changed: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${
        changed
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {changed
        ? "Changed"
        : "Temporary"}
    </span>
  );
}

function IconButton({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-slate-200 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function UserCard({
  user,
  onReset,
  onStatus,
  onDelete
}: {
  user: SecureManagedUser;
  onReset: () => void;
  onStatus: () => void;
  onDelete: () => void;
}) {
  const status =
    user.accountStatus ||
    "active";

  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <UserIdentity user={user} />
        <StatusLabel status={status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-500">
            Role
          </p>

          <div className="mt-1">
            <RoleLabel
              role={user.role}
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500">
            Password
          </p>

          <div className="mt-1">
            <PasswordLabel
              changed={Boolean(
                user.passwordChangedAt
              )}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <IconButton
          label="Reset password"
          onClick={onReset}
        >
          <RefreshCcw className="h-4 w-4" />
        </IconButton>

        <IconButton
          label={
            status === "active"
              ? "Deactivate user"
              : "Activate user"
          }
          onClick={onStatus}
        >
          {status === "active" ? (
            <CircleOff className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </IconButton>

        <IconButton
          label="Delete user"
          danger
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </article>
  );
}
