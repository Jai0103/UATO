export const accessPermissions = [
  "flightLogs",
  "attendance",
  "evaluations",
  "reports",
  "staffTraining",
  "uaMaintenance",
  "fatigueRisk"
] as const;

export type AccessPermission = (typeof accessPermissions)[number];

export const defaultTrainerPermissions: AccessPermission[] = [
  "flightLogs",
  "attendance",
  "evaluations",
  "reports"
];

export const permissionOptions: Array<{
  id: AccessPermission;
  label: string;
  description: string;
  standard: boolean;
}> = [
  { id: "flightLogs", label: "Flight Logs", description: "Create, update, and review flight records.", standard: true },
  { id: "attendance", label: "QR Attendance", description: "Open assigned sessions and view assigned attendance reports.", standard: true },
  { id: "evaluations", label: "Student Evaluations", description: "Manage assigned evaluation links and trainer results.", standard: true },
  { id: "reports", label: "Reports", description: "Generate reports for records available to the trainer.", standard: true },
  { id: "staffTraining", label: "Staff Training", description: "Manage staff training records and reports.", standard: false },
  { id: "uaMaintenance", label: "UA Maintenance", description: "Manage UA maintenance checks, records, and reports.", standard: false },
  { id: "fatigueRisk", label: "Fatigue Risk", description: "Manage fatigue-risk assessments and reports.", standard: false }
];

export function normalizeAccessPermissions(
  value: unknown,
  role: "admin" | "trainer" = "trainer"
): AccessPermission[] {
  if (role === "admin") return [...accessPermissions];
  if (!Array.isArray(value)) return [...defaultTrainerPermissions];
  const allowed = new Set<AccessPermission>(accessPermissions);
  return Array.from(new Set(value.filter((item): item is AccessPermission =>
    typeof item === "string" && allowed.has(item as AccessPermission)
  )));
}

export function hasAccess(
  subject: { role: "admin" | "trainer"; permissions?: AccessPermission[] },
  permission: AccessPermission
) {
  return subject.role === "admin" || normalizeAccessPermissions(subject.permissions, subject.role).includes(permission);
}

export function permissionForPath(pathname: string): AccessPermission | "admin" | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (["/", "/profile", "/settings", "/change-password"].includes(path)) return null;
  if (path === "/attendance/trainer" || path.startsWith("/attendance/trainer/")) return "attendance";
  if (path === "/evaluations/trainer" || path.startsWith("/evaluations/trainer/")) return "evaluations";
  if (path === "/flight-logs" || path.startsWith("/flight-logs/") || path === "/records" || path.startsWith("/records/")) return "flightLogs";
  if (path === "/reports" || path.startsWith("/reports/")) return "reports";
  if (path === "/staff-training" || path === "/staff-training/records" || path.startsWith("/staff-training/records/")) return "staffTraining";
  if (path === "/ua-maintenance" || path === "/ua-maintenance/records" || path.startsWith("/ua-maintenance/records/")) return "uaMaintenance";
  if (path === "/fatigue-risk" || path.startsWith("/fatigue-risk/")) return "fatigueRisk";
  if (path === "/approvals" || path.startsWith("/approvals/")) return "admin";
  return "admin";
}

export function firstAccessiblePath(permissions: AccessPermission[]) {
  const normalized = normalizeAccessPermissions(permissions);
  if (normalized.includes("flightLogs")) return "/flight-logs";
  if (normalized.includes("attendance")) return "/attendance/trainer";
  if (normalized.includes("evaluations")) return "/evaluations/trainer";
  if (normalized.includes("reports")) return "/reports";
  if (normalized.includes("staffTraining")) return "/staff-training";
  if (normalized.includes("uaMaintenance")) return "/ua-maintenance";
  if (normalized.includes("fatigueRisk")) return "/fatigue-risk";
  return "/profile";
}
