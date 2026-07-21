export type ApprovalType =
  | "uato_approval"
  | "uabto_approval"
  | "class_1_activity_permit"
  | "operator_permit";

export type ApprovalExpiryStatus =
  | "active"
  | "renewal_upcoming"
  | "due_soon"
  | "urgent"
  | "expires_today"
  | "expired"
  | "expiry_missing";

export type ApprovalRenewalStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "completed";

export type ApprovalDocumentStatus = "current" | "superseded";

export type ApprovalDocument = {
  id: string;
  approvalId: string;
  locationId: string;
  fileName: string;
  mimeType: string;
  driveFileId: string;
  driveUrl: string;
  status: ApprovalDocumentStatus;
  uploadedAt: string;
  uploadedByName: string;
  uploadedByEmail: string;
};

export type ApprovalLocation = {
  id: string;
  name: string;
  code: string;
  address: string;
  coordinates: string;
  effectiveDate: string;
  expiryDate: string;
  operationalLimitations: string;
  remarks: string;
  active: boolean;
};

export type ApprovalRecord = {
  id: string;
  approvalType: ApprovalType;
  approvalNumber: string;
  issuingAuthority: string;
  effectiveDate: string;
  expiryDate: string;
  responsiblePerson: string;
  responsibleEmail: string;
  renewalLeadDays: number;
  renewalStatus: ApprovalRenewalStatus;
  renewalSubmittedAt: string;
  renewalReference: string;
  generalConditions: string;
  remarks: string;
  locations: ApprovalLocation[];
  documents: ApprovalDocument[];
  archived: boolean;
  version: number;
  supersedesRecordId: string;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRecordSummary = Omit<
  ApprovalRecord,
  "locations" | "documents" | "generalConditions"
> & {
  locationCount: number;
  activeLocationCount: number;
  documentCount: number;
  hasCurrentDocument: boolean;
  displayExpiryDate: string;
  expiryStatus: ApprovalExpiryStatus;
  daysRemaining: number | null;
};

export type ApprovalDashboardSummary = {
  totalApprovals: number;
  activeApprovals: number;
  renewalUpcoming: number;
  dueSoon: number;
  urgent: number;
  expiringToday: number;
  expired: number;
  missingDocuments: number;
  nextExpiry: ApprovalRecordSummary | null;
};

export type ApprovalValidationResult = {
  valid: boolean;
  errors: string[];
};

export const CAAS_ESOMS_URL =
  "https://esoms.caas.gov.sg/esoms/landingpage.html";

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  uato_approval: "UATO Approval",
  uabto_approval: "UABTO Approval",
  class_1_activity_permit: "Class 1 Activity Permit",
  operator_permit: "Operator Permit"
};

export const APPROVAL_TYPE_OPTIONS = (
  Object.entries(APPROVAL_TYPE_LABELS) as Array<[ApprovalType, string]>
).map(([value, label]) => ({ value, label }));

export const APPROVAL_EXPIRY_LABELS: Record<
  ApprovalExpiryStatus,
  string
> = {
  active: "Active",
  renewal_upcoming: "Renewal Upcoming",
  due_soon: "Due Soon",
  urgent: "Urgent",
  expires_today: "Expires Today",
  expired: "Expired",
  expiry_missing: "Expiry Date Missing"
};

export const APPROVAL_RENEWAL_LABELS: Record<
  ApprovalRenewalStatus,
  string
> = {
  not_started: "Not Started",
  in_progress: "Renewal In Progress",
  submitted: "Submitted to CAAS",
  completed: "Renewed"
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKeyInSingapore(date: Date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyToUtcTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return time;
}

export function daysUntilApprovalExpiry(
  expiryDate: string,
  now = new Date()
): number | null {
  const expiryTime = dateKeyToUtcTime(expiryDate);
  const todayTime = dateKeyToUtcTime(dateKeyInSingapore(now));

  if (expiryTime === null || todayTime === null) return null;
  return Math.round((expiryTime - todayTime) / DAY_IN_MS);
}

export function getApprovalExpiryStatus(
  expiryDate: string,
  now = new Date()
): ApprovalExpiryStatus {
  const daysRemaining = daysUntilApprovalExpiry(expiryDate, now);

  if (daysRemaining === null) return "expiry_missing";
  if (daysRemaining < 0) return "expired";
  if (daysRemaining === 0) return "expires_today";
  if (daysRemaining <= 30) return "urgent";
  if (daysRemaining <= 60) return "due_soon";
  if (daysRemaining <= 90) return "renewal_upcoming";
  return "active";
}

export function getApprovalDisplayExpiryDate(record: ApprovalRecord) {
  if (record.approvalType !== "class_1_activity_permit") {
    return record.expiryDate;
  }

  const locationExpiryDates = record.locations
    .filter((location) => location.active)
    .map((location) => location.expiryDate)
    .filter((date) => dateKeyToUtcTime(date) !== null)
    .sort();

  return locationExpiryDates[0] || record.expiryDate;
}

export function hasCurrentApprovalDocument(record: ApprovalRecord) {
  return record.documents.some(
    (document) => document.status === "current" && document.driveFileId
  );
}

export function createEmptyApprovalLocation(): ApprovalLocation {
  return {
    id: createId("approval-location"),
    name: "",
    code: "",
    address: "",
    coordinates: "",
    effectiveDate: "",
    expiryDate: "",
    operationalLimitations: "",
    remarks: "",
    active: true
  };
}

export function createEmptyApprovalRecord(
  approvalType: ApprovalType = "uato_approval"
): ApprovalRecord {
  const now = new Date().toISOString();

  return {
    id: createId("approval"),
    approvalType,
    approvalNumber: "",
    issuingAuthority: "Civil Aviation Authority of Singapore",
    effectiveDate: "",
    expiryDate: "",
    responsiblePerson: "",
    responsibleEmail: "",
    renewalLeadDays: 90,
    renewalStatus: "not_started",
    renewalSubmittedAt: "",
    renewalReference: "",
    generalConditions: "",
    remarks: "",
    locations:
      approvalType === "class_1_activity_permit"
        ? [createEmptyApprovalLocation()]
        : [],
    documents: [],
    archived: false,
    version: 1,
    supersedesRecordId: "",
    createdAt: now,
    updatedAt: now
  };
}

export function summarizeApprovalRecord(
  record: ApprovalRecord,
  now = new Date()
): ApprovalRecordSummary {
  const displayExpiryDate = getApprovalDisplayExpiryDate(record);
  const activeLocationCount = record.locations.filter(
    (location) => location.active
  ).length;
  const { locations, documents, generalConditions, ...summary } = record;

  return {
    ...summary,
    locationCount: locations.length,
    activeLocationCount,
    documentCount: documents.length,
    hasCurrentDocument: hasCurrentApprovalDocument(record),
    displayExpiryDate,
    expiryStatus: getApprovalExpiryStatus(displayExpiryDate, now),
    daysRemaining: daysUntilApprovalExpiry(displayExpiryDate, now)
  };
}

export function buildApprovalDashboardSummary(
  records: ApprovalRecord[],
  now = new Date()
): ApprovalDashboardSummary {
  const summaries = records
    .filter((record) => !record.archived)
    .map((record) => summarizeApprovalRecord(record, now));

  const count = (status: ApprovalExpiryStatus) =>
    summaries.filter((record) => record.expiryStatus === status).length;

  const nextExpiry = summaries
    .filter(
      (record) =>
        record.daysRemaining !== null && record.daysRemaining >= 0
    )
    .sort(
      (first, second) =>
        (first.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
        (second.daysRemaining ?? Number.MAX_SAFE_INTEGER)
    )[0] ?? null;

  return {
    totalApprovals: summaries.length,
    activeApprovals: count("active"),
    renewalUpcoming: count("renewal_upcoming"),
    dueSoon: count("due_soon"),
    urgent: count("urgent"),
    expiringToday: count("expires_today"),
    expired: count("expired"),
    missingDocuments: summaries.filter(
      (record) => !record.hasCurrentDocument
    ).length,
    nextExpiry
  };
}

export function validateApprovalRecord(
  record: ApprovalRecord,
  requireDocument = true
): ApprovalValidationResult {
  const errors: string[] = [];

  if (!APPROVAL_TYPE_LABELS[record.approvalType]) {
    errors.push("Select a valid approval type.");
  }
  if (!record.approvalNumber.trim()) {
    errors.push("Enter the approval or permit number.");
  }
  if (!record.issuingAuthority.trim()) {
    errors.push("Enter the issuing authority.");
  }
  if (dateKeyToUtcTime(record.effectiveDate) === null) {
    errors.push("Enter a valid effective date.");
  }
  if (dateKeyToUtcTime(record.expiryDate) === null) {
    errors.push("Enter a valid expiry date.");
  }
  if (
    dateKeyToUtcTime(record.effectiveDate) !== null &&
    dateKeyToUtcTime(record.expiryDate) !== null &&
    record.effectiveDate > record.expiryDate
  ) {
    errors.push("The expiry date must be on or after the effective date.");
  }
  if (!record.responsiblePerson.trim()) {
    errors.push("Enter the responsible person.");
  }
  if (requireDocument && !hasCurrentApprovalDocument(record)) {
    errors.push("Upload the current approval document.");
  }

  if (record.approvalType === "class_1_activity_permit") {
    const activeLocations = record.locations.filter(
      (location) => location.active
    );

    if (!activeLocations.length) {
      errors.push("Add at least one active permitted location.");
    }

    activeLocations.forEach((location, index) => {
      const label = location.name.trim() || `Location ${index + 1}`;

      if (!location.name.trim()) {
        errors.push(`Enter the name for ${label}.`);
      }
      if (dateKeyToUtcTime(location.expiryDate) === null) {
        errors.push(`Enter a valid expiry date for ${label}.`);
      }
      if (
        location.effectiveDate &&
        dateKeyToUtcTime(location.effectiveDate) === null
      ) {
        errors.push(`Enter a valid effective date for ${label}.`);
      }
      if (
        location.effectiveDate &&
        location.expiryDate &&
        location.effectiveDate > location.expiryDate
      ) {
        errors.push(
          `The expiry date for ${label} must be on or after its effective date.`
        );
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
