import type { UserRole } from "@/lib/demo-auth";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
  createdAt: string;
  passwordChangedAt?: string;
};

export const managedUsersKey = "uapl_managed_users";

export function getManagedUsers(): ManagedUser[] {
  if (typeof window === "undefined") return [];

  const rawUsers = localStorage.getItem(managedUsersKey);
  if (!rawUsers) return [];

  try {
    return JSON.parse(rawUsers) as ManagedUser[];
  } catch {
    localStorage.removeItem(managedUsersKey);
    return [];
  }
}

export function saveManagedUsers(users: ManagedUser[]) {
  localStorage.setItem(managedUsersKey, JSON.stringify(users));
}

export function createManagedUser(input: {
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
}): ManagedUser {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    role: input.role,
    temporaryPassword: input.temporaryPassword,
    createdAt: new Date().toISOString(),
    passwordChangedAt: ""
  };
}
