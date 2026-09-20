import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { writeFirebaseAudit } from "@/lib/firebase-audit";
import type {
  FlightLogRecord,
  FlightLogRow
} from "@/lib/flight-log-storage";
import {
  postToGoogle,
  FlightLogRecordSummary,
  RecordsPageRequest,
  RecordsPageResponse
} from "@/lib/google-api";
import type { MasterData, MasterDataKey } from "@/lib/master-data";

const WRITE_BATCH_SIZE = 400;
// Updates replace entries and battery reservations in one transaction. Keeping
// this below 125 leaves headroom under Firestore's 500-write transaction limit.
const MAX_LIVE_ROWS = 120;
const MASTER_DATA_CACHE_MS = 5 * 60_000;
const ADMIN_CACHE_MS = 2 * 60_000;
let masterDataCache: { expiresAt: number; value: MasterData } | null = null;
let adminCache: {
  expiresAt: number;
  uid: string;
  name: string;
  email: string;
  role: "admin";
} | null = null;

export class FlightLogFirebaseError extends Error {
  code: string;

  constructor(message: string, code = "FIREBASE_FLIGHT_ERROR") {
    super(message);
    this.name = "FlightLogFirebaseError";
    this.code = code;
  }
}

export type FirebaseFlightValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type FirebaseFlightMasterDataCatalog = {
  sections: Record<
    MasterDataKey,
    Array<{
      id: string;
      value: string;
      status: "active" | "inactive";
    }>
  >;
};

type FirestoreOperation =
  | {
      type: "set";
      reference: DocumentReference<DocumentData>;
      data: DocumentData;
    }
  | {
      type: "delete";
      reference: DocumentReference<DocumentData>;
    };

async function requireFirebaseUser() {
  await firebaseAuth.authStateReady();

  if (!firebaseAuth.currentUser) {
    throw new Error("Your Firebase session has expired. Please sign in again.");
  }

  return firebaseAuth.currentUser;
}

async function requireFirebaseAdmin() {
  const user = await requireFirebaseUser();
  if (adminCache && adminCache.uid === user.uid && adminCache.expiresAt > Date.now()) {
    return adminCache;
  }

  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (
    !profile.exists() ||
    profile.data().status !== "active" ||
    profile.data().role !== "admin"
  ) {
    throw new Error("Administrator access is required.");
  }

  adminCache = {
    expiresAt: Date.now() + ADMIN_CACHE_MS,
    uid: user.uid,
    name: String(
      profile.data().name || user.displayName || user.email || "Administrator"
    ).trim(),
    email: String(profile.data().email || user.email || "").trim().toLowerCase(),
    role: "admin"
  };
  return adminCache;
}

function normalizedIdentifier(value: string) {
  return String(value || "").trim().toUpperCase();
}

function identifierDocumentId(value: string) {
  return normalizedIdentifier(value).replace(/[^A-Z0-9_-]/g, "-");
}

function toIsoString(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && value) return value;
  return "";
}

function safeTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Timestamp.now() : Timestamp.fromDate(date);
}

function dateTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function deterministicEntryId(recordId: string, index: number) {
  return `${recordId.replace(/\//g, "_")}-${String(index + 1).padStart(5, "0")}`;
}

function summaryFromDocument(id: string, data: DocumentData): FlightLogRecordSummary {
  return {
    id,
    student: {
      studentName: String(data.studentName || ""),
      company: String(data.company || ""),
      lastFourCharacters: String(data.lastFourCharacters || ""),
      studentSignatureDataUrl: ""
    },
    rows: [],
    flightCount: Number(data.flightCount) || 0,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt)
  };
}

function rowFromDocument(data: DocumentData): FlightLogRow {
  return {
    date: String(data.date || ""),
    location: String(data.location || ""),
    startTime: String(data.startTime || ""),
    duration: String(data.durationMinutes ?? ""),
    uaModel: String(data.uaModel || ""),
    uaCategory: String(data.uaCategory || ""),
    batterySn: String(data.batterySn || ""),
    pilotInCommand: String(data.pilotInCommand || ""),
    instructorInCommand: String(data.instructorInCommand || ""),
    remarks: String(data.remarks || "")
  };
}

async function commitOperations(operations: FirestoreOperation[]) {
  for (let start = 0; start < operations.length; start += WRITE_BATCH_SIZE) {
    const batch = writeBatch(firestore);
    operations.slice(start, start + WRITE_BATCH_SIZE).forEach((operation) => {
      if (operation.type === "delete") batch.delete(operation.reference);
      else batch.set(operation.reference, operation.data);
    });
    await batch.commit();
  }
}

export async function fetchFirebaseFlightLogRecordsPage(
  request: RecordsPageRequest = {}
): Promise<RecordsPageResponse> {
  await requireFirebaseUser();

  const pageSize = Math.max(1, Math.min(Number(request.pageSize) || 10, 25));
  const requestedPage = Math.max(1, Number(request.page) || 1);
  const search = String(request.query || "").trim().toLowerCase();
  const month = String(request.month || "").padStart(2, "0");
  const year = String(request.year || "");
  let allowedRecordIds: Set<string> | null = null;

  if (request.month || request.year) {
    const entrySnapshot = request.year
      ? await getDocs(
          query(
            collection(firestore, "flightEntries"),
            where("year", "==", Number(year))
          )
        )
      : await getDocs(collection(firestore, "flightEntries"));

    allowedRecordIds = new Set(
      entrySnapshot.docs
        .filter((entry) => {
          if (!request.month) return true;
          return String(Number(entry.data().month)).padStart(2, "0") === month;
        })
        .map((entry) => String(entry.data().recordId || ""))
        .filter(Boolean)
    );
  }

  const recordSnapshot = await getDocs(collection(firestore, "flightLogRecords"));
  const matchingRecords = recordSnapshot.docs
    .map((snapshot) => summaryFromDocument(snapshot.id, snapshot.data()))
    .filter((record) => !allowedRecordIds || allowedRecordIds.has(record.id))
    .filter((record) => {
      if (!search) return true;
      return [
        record.student.studentName,
        record.student.company,
        record.student.lastFourCharacters
      ].some((value) => value.toLowerCase().includes(search));
    })
    .sort((first, second) => {
      return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
    });

  const totalRecords = matchingRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    records: matchingRecords.slice(start, start + pageSize),
    page,
    pageSize,
    totalRecords,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  };
}

export async function fetchFirebaseFlightLogRecordById(recordId: string) {
  await requireFirebaseUser();

  const cleanRecordId = String(recordId || "").trim();
  if (!cleanRecordId) throw new Error("Flight Log record ID is required.");

  const [recordSnapshot, entrySnapshot, signatureSnapshot] = await Promise.all([
    getDoc(doc(firestore, "flightLogRecords", cleanRecordId)),
    getDocs(
      query(
        collection(firestore, "flightEntries"),
        where("recordId", "==", cleanRecordId)
      )
    ),
    getDoc(doc(firestore, "flightLogSignatures", cleanRecordId))
  ]);

  if (!recordSnapshot.exists()) {
    throw new Error("The Flight Log record was not found in Firebase.");
  }

  const data = recordSnapshot.data();
  const rows = entrySnapshot.docs
    .sort(
      (first, second) =>
        (Number(first.data().sourceRowIndex) || 0) -
        (Number(second.data().sourceRowIndex) || 0)
    )
    .map((entry) => rowFromDocument(entry.data()));

  const record: FlightLogRecord = {
    id: recordSnapshot.id,
    student: {
      studentName: String(data.studentName || ""),
      company: String(data.company || ""),
      lastFourCharacters: String(data.lastFourCharacters || ""),
      studentSignatureDataUrl: signatureSnapshot.exists()
        ? String(signatureSnapshot.data().dataUrl || "")
        : ""
    },
    rows,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt)
  };

  return record;
}

export async function fetchFirebaseFlightLogRecordsByIds(recordIds: string[]) {
  const uniqueIds = Array.from(new Set(recordIds.filter(Boolean))).slice(0, 100);
  const records: FlightLogRecord[] = [];

  for (let start = 0; start < uniqueIds.length; start += 20) {
    const group = uniqueIds.slice(start, start + 20);
    records.push(...(await Promise.all(group.map(fetchFirebaseFlightLogRecordById))));
  }

  return records;
}

export async function fetchFirebaseFlightLogsByDateRange(
  dateFrom: string,
  dateTo: string
) {
  await requireFirebaseUser();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error("Select a valid Flight Log date range.");
  }
  if (dateFrom > dateTo) {
    throw new Error("Flight Log start date cannot be after its end date.");
  }

  const entrySnapshot = await getDocs(
    query(
      collection(firestore, "flightEntries"),
      where("date", ">=", dateFrom),
      where("date", "<=", dateTo)
    )
  );
  const recordIds = Array.from(
    new Set(
      entrySnapshot.docs
        .map((entry) => String(entry.data().recordId || ""))
        .filter(Boolean)
    )
  );

  if (recordIds.length > 100) {
    throw new Error(
      "This date range contains more than 100 students. Select a shorter range."
    );
  }

  const records = await fetchFirebaseFlightLogRecordsByIds(recordIds);
  return records
    .map((record) => ({
      ...record,
      rows: record.rows.filter((row) => row.date >= dateFrom && row.date <= dateTo)
    }))
    .filter((record) => record.rows.length > 0);
}

export type FirebaseFlightDashboard = {
  totalStudents: number;
  totalRecords: number;
  pendingRecords: number;
  completedRecords: number;
  activeTrainers: number;
  totalFlights: number;
  totalMinutes: number;
  recentRecords: Array<{
    id: string;
    studentName: string;
    company: string;
    flightCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  monthlyActivity: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

function singaporeMonthKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return `${year}-${month}`;
}

function latestTwelveMonths() {
  const values: Array<{ key: string; label: string; count: number }> = [];
  const current = new Date();
  current.setDate(1);

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(current.getFullYear(), current.getMonth() - offset, 1);
    values.push({
      key: singaporeMonthKey(date),
      label: new Intl.DateTimeFormat("en-SG", {
        month: "short",
        year: "numeric"
      }).format(date),
      count: 0
    });
  }

  return values;
}

export async function fetchFirebaseFlightDashboard(): Promise<FirebaseFlightDashboard> {
  await requireFirebaseUser();

  const [recordSnapshot, signatureSnapshot, userSnapshot] = await Promise.all([
    getDocs(collection(firestore, "flightLogRecords")),
    getDocs(collection(firestore, "flightLogSignatures")),
    getDocs(collection(firestore, "users"))
  ]);
  const records = recordSnapshot.docs.map((snapshot) => ({
    summary: summaryFromDocument(snapshot.id, snapshot.data()),
    totalMinutes: Number(snapshot.data().totalDurationMinutes) || 0
  }));
  const signedRecordIds = new Set(signatureSnapshot.docs.map((item) => item.id));
  const monthlyActivity = latestTwelveMonths();
  const monthCounts = new Map(monthlyActivity.map((month) => [month.key, 0]));

  records.forEach(({ summary }) => {
    const updated = new Date(summary.updatedAt);
    if (Number.isNaN(updated.getTime())) return;
    const key = singaporeMonthKey(updated);
    if (monthCounts.has(key)) monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  });

  monthlyActivity.forEach((month) => {
    month.count = monthCounts.get(month.key) || 0;
  });

  const completedRecords = records.filter(
    ({ summary }) => signedRecordIds.has(summary.id) && summary.flightCount > 0
  ).length;
  const recentRecords = records
    .map(({ summary }) => ({
      id: summary.id,
      studentName: summary.student.studentName,
      company: summary.student.company,
      flightCount: summary.flightCount,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt
    }))
    .sort(
      (first, second) =>
        new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
    )
    .slice(0, 5);
  const activeTrainers = userSnapshot.docs.filter((snapshot) => {
    const user = snapshot.data();
    return user.status === "active" && user.role === "trainer";
  }).length;

  return {
    totalStudents: records.length,
    totalRecords: records.length,
    pendingRecords: records.length - completedRecords,
    completedRecords,
    activeTrainers,
    totalFlights: records.reduce(
      (total, { summary }) => total + summary.flightCount,
      0
    ),
    totalMinutes: records.reduce((total, record) => total + record.totalMinutes, 0),
    recentRecords,
    monthlyActivity
  };
}

export async function fetchFirebaseFlightMasterData(force = false) {
  await requireFirebaseUser();

  if (!force && masterDataCache && masterDataCache.expiresAt > Date.now()) {
    return masterDataCache.value;
  }

  const snapshot = await getDocs(collection(firestore, "flightLogMasterData"));
  const sections: Record<MasterDataKey, Array<{ value: string; sortOrder: number }>> = {
    locations: [],
    batterySerialNumbers: [],
    afeInstructors: [],
    uaModels: [],
    uaCategories: []
  };

  snapshot.docs.forEach((item) => {
    const data = item.data();
    const section = String(data.section || "") as MasterDataKey;
    if (!(section in sections) || data.status === "inactive") return;
    const value = String(data.value || "").trim();
    if (value) sections[section].push({ value, sortOrder: Number(data.sortOrder) || 0 });
  });

  const masterData = Object.fromEntries(
    Object.entries(sections).map(([section, values]) => [
      section,
      values
        .sort((first, second) => first.sortOrder - second.sortOrder)
        .map((item) => item.value)
    ])
  ) as MasterData;

  masterDataCache = {
    expiresAt: Date.now() + MASTER_DATA_CACHE_MS,
    value: masterData
  };
  return masterData;
}

export async function fetchFirebaseFlightMasterDataCatalog() {
  await requireFirebaseUser();
  const snapshot = await getDocs(collection(firestore, "flightLogMasterData"));
  const catalog: FirebaseFlightMasterDataCatalog = {
    sections: {
      locations: [],
      batterySerialNumbers: [],
      afeInstructors: [],
      uaModels: [],
      uaCategories: []
    }
  };

  snapshot.docs
    .sort(
      (first, second) =>
        (Number(first.data().sortOrder) || 0) -
        (Number(second.data().sortOrder) || 0)
    )
    .forEach((item) => {
      const data = item.data();
      const section = String(data.section || "") as MasterDataKey;
      if (!(section in catalog.sections)) return;
      catalog.sections[section].push({
        id: String(data.id || item.id),
        value: String(data.value || ""),
        status: data.status === "inactive" ? "inactive" : "active"
      });
    });

  return catalog;
}

export async function saveFirebaseFlightMasterDataCatalog(
  catalog: FirebaseFlightMasterDataCatalog
) {
  const actor = await requireFirebaseAdmin();
  const existing = await getDocs(collection(firestore, "flightLogMasterData"));
  const previousCatalog: FirebaseFlightMasterDataCatalog = {
    sections: {
      locations: [],
      batterySerialNumbers: [],
      afeInstructors: [],
      uaModels: [],
      uaCategories: []
    }
  };

  existing.docs
    .sort(
      (first, second) =>
        (Number(first.data().sortOrder) || 0) -
        (Number(second.data().sortOrder) || 0)
    )
    .forEach((item) => {
      const data = item.data();
      const section = String(data.section || "") as MasterDataKey;
      if (!(section in previousCatalog.sections)) return;
      previousCatalog.sections[section].push({
        id: String(data.id || item.id),
        value: String(data.value || ""),
        status: data.status === "inactive" ? "inactive" : "active"
      });
    });
  const operations: FirestoreOperation[] = existing.docs.map((item) => ({
    type: "delete",
    reference: item.ref
  }));

  (Object.keys(catalog.sections) as MasterDataKey[]).forEach((section) => {
    catalog.sections[section].forEach((item, sortOrder) => {
      const documentId = `${section}__${item.id}`.replace(/\//g, "_");
      operations.push({
        type: "set",
        reference: doc(firestore, "flightLogMasterData", documentId),
        data: {
          id: item.id,
          section,
          value: item.value.trim(),
          valueLower: item.value.trim().toLowerCase(),
          status: item.status === "inactive" ? "inactive" : "active",
          sortOrder,
          updatedAt: Timestamp.now(),
          schemaVersion: 2
        }
      });
    });
  });

  await commitOperations(operations);
  const sectionCounts = Object.fromEntries(
    (Object.keys(catalog.sections) as MasterDataKey[]).map((section) => {
      const items = catalog.sections[section];
      return [
        section,
        {
          total: items.length,
          active: items.filter((item) => item.status === "active").length,
          inactive: items.filter((item) => item.status === "inactive").length
        }
      ];
    })
  );

  await writeFirebaseAudit({
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "FLIGHT_MASTER_DATA_UPDATED",
    entityType: "flightMasterData",
    entityId: "catalog",
    entityName: "Flight Log Master Data",
    previousValue: previousCatalog,
    updatedValue: catalog,
    details: { sectionCounts }
  });
  masterDataCache = null;
  return catalog;
}

export async function checkFirebaseStudentLastFour(payload: {
  lastFourCharacters: string;
  recordId?: string;
}) {
  await requireFirebaseUser();
  const identifier = normalizedIdentifier(payload.lastFourCharacters);

  if (!identifier) {
    return { available: false, message: "Enter the last 4 characters before continuing." };
  }

  const snapshot = await getDoc(
    doc(firestore, "flightLogIdentifiers", identifierDocumentId(identifier))
  );
  if (snapshot.exists() && String(snapshot.data().recordId || "") !== String(payload.recordId || "")) {
    return {
      available: false,
      conflictingRecordId: String(snapshot.data().recordId || ""),
      conflictingStudentName: String(snapshot.data().studentName || ""),
      message: `The last 4 characters are already assigned to ${String(
        snapshot.data().studentName || "another student"
      )}.`
    };
  }

  return { available: true, message: "The last 4 characters are available." };
}

export async function fetchFirebaseUnavailableBatteriesForDate(payload: {
  date: string;
  recordId?: string;
}) {
  await requireFirebaseUser();
  const date = String(payload.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { date: "", unavailableBatteries: [] as string[] };
  }

  const snapshot = await getDocs(
    query(collection(firestore, "flightEntries"), where("date", "==", date))
  );
  const unavailable = new Map<string, string>();
  snapshot.docs.forEach((entry) => {
    const data = entry.data();
    if (String(data.recordId || "") === String(payload.recordId || "")) return;
    const battery = String(data.batterySn || "").trim();
    if (battery) unavailable.set(battery.toLowerCase(), battery);
  });

  return {
    date,
    unavailableBatteries: Array.from(unavailable.values()).sort()
  };
}

function singaporeToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function normalizedFlightText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function flightDuplicateKey(row: FlightLogRow) {
  return [
    row.date,
    normalizedFlightText(row.location),
    row.startTime,
    normalizedFlightText(row.uaModel),
    normalizedFlightText(row.batterySn)
  ].join("|");
}

function batteryReservationKey(row: Pick<FlightLogRow, "date" | "batterySn">) {
  const battery = normalizedFlightText(row.batterySn).replace(/[^a-z0-9_-]/g, "-");
  return `${row.date}__${battery}`;
}

export async function validateFirebaseFlightLogRecord(
  record: FlightLogRecord
): Promise<FirebaseFlightValidation> {
  await requireFirebaseUser();
  const errors: string[] = [];
  const rows = Array.isArray(record.rows) ? record.rows : [];
  const identifier = normalizedIdentifier(record.student.lastFourCharacters);
  const today = singaporeToday();

  if (!record.student.studentName.trim()) errors.push("Student name is required.");
  if (!record.student.company.trim()) errors.push("Company or organisation is required.");
  if (!identifier) errors.push("The last 4 characters are required.");
  if (!rows.length) errors.push("At least one flight entry is required.");
  if (rows.length > MAX_LIVE_ROWS) {
    errors.push(`A single student record cannot exceed ${MAX_LIVE_ROWS} flight entries.`);
  }

  const [identifierResult, signatureSnapshot, masterData] = await Promise.all([
    identifier
      ? checkFirebaseStudentLastFour({
          lastFourCharacters: identifier,
          recordId: record.id
        })
      : Promise.resolve({ available: false, message: "" }),
    getDoc(doc(firestore, "flightLogSignatures", record.id)),
    fetchFirebaseFlightMasterData()
  ]);

  if (identifier && !identifierResult.available) errors.push(identifierResult.message);
  const submittedSignature = record.student.studentSignatureDataUrl.startsWith("data:image/");
  if (!submittedSignature && !signatureSnapshot.exists()) {
    errors.push("Student signature is required before final save.");
  }

  const activeModels = new Set(masterData.uaModels.map(normalizedFlightText));
  const activeBatteries = new Set(
    masterData.batterySerialNumbers.map(normalizedFlightText)
  );
  const seenFlights = new Set<string>();
  const seenBatteryDates = new Set<string>();

  rows.forEach((row, index) => {
    const number = index + 1;
    const duration = Number(row.duration);
    const model = normalizedFlightText(row.uaModel);
    const battery = normalizedFlightText(row.batterySn);
    const duplicateKey = flightDuplicateKey(row);
    const batteryDateKey = `${row.date}|${battery}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      errors.push(`Flight ${number} has an invalid date.`);
    } else if (row.date > today) {
      errors.push(`Flight ${number} cannot use a future date.`);
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime)) {
      errors.push(`Flight ${number} must use start time HH:MM.`);
    }
    if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) {
      errors.push(`Flight ${number} duration must be a whole number from 1 to 1440 minutes.`);
    }
    if (!row.location.trim()) errors.push(`Flight ${number} requires a location.`);
    if (!row.uaCategory.trim()) errors.push(`Flight ${number} requires a UA category.`);
    if (!row.pilotInCommand.trim()) errors.push(`Flight ${number} requires a Pilot in Command.`);
    if (!row.instructorInCommand.trim()) {
      errors.push(`Flight ${number} requires an AFE or Instructor.`);
    }
    if (!model || !activeModels.has(model)) {
      errors.push(`Flight ${number} must use an active UA model.`);
    }
    if (!battery || !activeBatteries.has(battery)) {
      errors.push(`Flight ${number} must use an active battery.`);
    }
    if (seenFlights.has(duplicateKey)) {
      errors.push(`Flight ${number} duplicates another entry in this record.`);
    }
    seenFlights.add(duplicateKey);
    if (battery && seenBatteryDates.has(batteryDateKey)) {
      errors.push(`Battery ${row.batterySn} is already used in this record on ${row.date}.`);
    }
    if (battery) seenBatteryDates.add(batteryDateKey);
  });

  const validDates = Array.from(
    new Set(rows.map((row) => row.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))
  );
  const savedEntries = (
    await Promise.all(
      validDates.map((date) =>
        getDocs(query(collection(firestore, "flightEntries"), where("date", "==", date)))
      )
    )
  ).flatMap((snapshot) => snapshot.docs);

  rows.forEach((row, index) => {
    const battery = normalizedFlightText(row.batterySn);
    savedEntries.forEach((entry) => {
      const saved = entry.data();
      if (String(saved.recordId || "") === record.id || String(saved.date || "") !== row.date) {
        return;
      }
      if (battery && normalizedFlightText(saved.batterySn) === battery) {
        errors.push(
          `Battery ${row.batterySn} is already used on ${row.date} by ${String(
            saved.studentName || "another student"
          )}.`
        );
      }
      if (flightDuplicateKey(row) === flightDuplicateKey(rowFromDocument(saved))) {
        errors.push(
          `Flight ${index + 1} duplicates a saved entry for ${String(
            saved.studentName || "another student"
          )}.`
        );
      }
    });
  });

  const uniqueErrors = Array.from(new Set(errors));
  return { valid: uniqueErrors.length === 0, errors: uniqueErrors, warnings: [] };
}

function timestampsMatch(expected: string, current: unknown) {
  const expectedTime = new Date(expected).getTime();
  const currentText = toIsoString(current);
  const currentTime = new Date(currentText).getTime();
  return Number.isFinite(expectedTime) && Number.isFinite(currentTime)
    ? expectedTime === currentTime
    : expected === currentText;
}

export async function saveFirebaseFlightLogRecord(record: FlightLogRecord) {
  const user = await requireFirebaseUser();
  const validation = await validateFirebaseFlightLogRecord(record);
  if (validation.errors.length) {
    throw new FlightLogFirebaseError(validation.errors.join(" "), "VALIDATION_FAILED");
  }

  const previousRecord = record.id
    ? await fetchFirebaseFlightLogRecordById(record.id).catch(() => null)
    : null;
  const existingEntries = await getDocs(
    query(collection(firestore, "flightEntries"), where("recordId", "==", record.id))
  );
  const now = new Date();
  const updatedAt = now.toISOString();
  const createdAt = previousRecord?.createdAt || record.createdAt || updatedAt;
  const identifier = normalizedIdentifier(record.student.lastFourCharacters);
  const desiredReservationKeys = Array.from(
    new Set(record.rows.map((row) => batteryReservationKey(row)))
  );
  const previousReservationKeys = Array.from(
    new Set(
      existingEntries.docs.map((entry) =>
        batteryReservationKey(rowFromDocument(entry.data()))
      )
    )
  );
  const allReservationKeys = Array.from(
    new Set([...desiredReservationKeys, ...previousReservationKeys])
  );
  const savedRecord: FlightLogRecord = {
    ...record,
    student: { ...record.student, lastFourCharacters: identifier },
    createdAt,
    updatedAt
  };

  await runTransaction(firestore, async (transaction) => {
    const recordReference = doc(firestore, "flightLogRecords", record.id);
    const identifierReference = doc(
      firestore,
      "flightLogIdentifiers",
      identifierDocumentId(identifier)
    );
    const oldIdentifier = previousRecord
      ? normalizedIdentifier(previousRecord.student.lastFourCharacters)
      : "";
    const oldIdentifierReference = oldIdentifier && oldIdentifier !== identifier
      ? doc(firestore, "flightLogIdentifiers", identifierDocumentId(oldIdentifier))
      : null;
    const reservationReferences = allReservationKeys.map((key) =>
      doc(firestore, "flightBatteryReservations", key)
    );
    const [currentRecord, identifierSnapshot, oldIdentifierSnapshot, ...reservations] =
      await Promise.all([
        transaction.get(recordReference),
        transaction.get(identifierReference),
        oldIdentifierReference ? transaction.get(oldIdentifierReference) : Promise.resolve(null),
        ...reservationReferences.map((reference) => transaction.get(reference))
      ]);

    if (currentRecord.exists()) {
      if (!record.updatedAt || !timestampsMatch(record.updatedAt, currentRecord.data().updatedAt)) {
        throw new FlightLogFirebaseError(
          "This student record was updated by another trainer. Load the latest record and merge your unsaved flights before saving again.",
          "RECORD_CONFLICT"
        );
      }
    }
    if (
      identifierSnapshot.exists() &&
      String(identifierSnapshot.data().recordId || "") !== record.id
    ) {
      throw new FlightLogFirebaseError(
        `The last 4 characters are already assigned to ${String(
          identifierSnapshot.data().studentName || "another student"
        )}.`,
        "DUPLICATE_IDENTIFIER"
      );
    }

    desiredReservationKeys.forEach((key) => {
      const index = allReservationKeys.indexOf(key);
      const reservation = reservations[index];
      if (
        reservation?.exists() &&
        String(reservation.data().recordId || "") !== record.id
      ) {
        throw new FlightLogFirebaseError(
          `Battery ${String(reservation.data().batterySn || "")} is already reserved on ${String(
            reservation.data().date || "the selected date"
          )}.`,
          "BATTERY_CONFLICT"
        );
      }
    });

    existingEntries.docs.forEach((entry) => transaction.delete(entry.ref));
    transaction.set(recordReference, {
      id: record.id,
      studentName: record.student.studentName.trim(),
      studentNameLower: record.student.studentName.trim().toLowerCase(),
      company: record.student.company.trim(),
      companyLower: record.student.company.trim().toLowerCase(),
      lastFourCharacters: identifier,
      flightCount: record.rows.length,
      totalDurationMinutes: record.rows.reduce(
        (total, row) => total + (Number(row.duration) || 0),
        0
      ),
      firstFlightDate: [...record.rows.map((row) => row.date)].sort()[0] || "",
      lastFlightDate: [...record.rows.map((row) => row.date)].sort().at(-1) || "",
      createdAt: safeTimestamp(createdAt),
      updatedAt: Timestamp.fromDate(now),
      updatedByUid: user.uid,
      updatedByEmail: user.email || "",
      source: "firebase-live",
      schemaVersion: 2
    });
    transaction.set(identifierReference, {
      identifier,
      recordId: record.id,
      studentName: record.student.studentName.trim(),
      updatedAt: Timestamp.fromDate(now)
    });
    if (
      oldIdentifierReference &&
      oldIdentifierSnapshot?.exists() &&
      String(oldIdentifierSnapshot.data().recordId || "") === record.id
    ) {
      transaction.delete(oldIdentifierReference);
    }

    record.rows.forEach((row, index) => {
      const entryId = deterministicEntryId(record.id, index);
      transaction.set(doc(firestore, "flightEntries", entryId), {
        id: entryId,
        recordId: record.id,
        studentName: record.student.studentName.trim(),
        company: record.student.company.trim(),
        lastFourCharacters: identifier,
        date: row.date,
        dateTimestamp: dateTimestamp(row.date),
        month: Number(row.date.slice(5, 7)),
        year: Number(row.date.slice(0, 4)),
        location: row.location,
        startTime: row.startTime,
        durationMinutes: Number(row.duration),
        uaModel: row.uaModel,
        uaCategory: row.uaCategory,
        batterySn: row.batterySn,
        pilotInCommand: row.pilotInCommand,
        instructorInCommand: row.instructorInCommand,
        remarks: row.remarks,
        sourceRowIndex: index,
        updatedAt: Timestamp.fromDate(now),
        schemaVersion: 2
      });
    });

    const signatureReference = doc(firestore, "flightLogSignatures", record.id);
    if (record.student.studentSignatureDataUrl) {
      transaction.set(signatureReference, {
        recordId: record.id,
        dataUrl: record.student.studentSignatureDataUrl,
        updatedAt: Timestamp.fromDate(now),
        schemaVersion: 2
      });
    }

    allReservationKeys.forEach((key, index) => {
      const reference = reservationReferences[index];
      const reservation = reservations[index];
      if (desiredReservationKeys.includes(key)) {
        const row = record.rows.find((item) => batteryReservationKey(item) === key);
        transaction.set(reference, {
          recordId: record.id,
          studentName: record.student.studentName.trim(),
          date: row?.date || "",
          batterySn: row?.batterySn || "",
          updatedAt: Timestamp.fromDate(now)
        });
      } else if (
        reservation?.exists() &&
        String(reservation.data().recordId || "") === record.id
      ) {
        transaction.delete(reference);
      }
    });
    transaction.delete(doc(firestore, "flightLogTombstones", record.id));
  });

  return { record: savedRecord, previousRecord, validation };
}

export async function logFirebaseFlightAudit(
  action: "FLIGHT_CREATED" | "FLIGHT_UPDATED" | "FLIGHT_DELETED",
  record: FlightLogRecord,
  previousRecord: FlightLogRecord | null
) {
  return postToGoogle<{ auditId?: string }>({
    action: "recordFirebaseFlightAudit",
    auditAction: action,
    record,
    previousRecord
  });
}

export async function mirrorFlightLogRecordToFirebase(record: FlightLogRecord) {
  await requireFirebaseUser();

  const recordReference = doc(firestore, "flightLogRecords", record.id);
  const [existingRecord, existingEntries] = await Promise.all([
    getDoc(recordReference),
    getDocs(
      query(
        collection(firestore, "flightEntries"),
        where("recordId", "==", record.id)
      )
    )
  ]);
  const previousIdentifier = existingRecord.exists()
    ? normalizedIdentifier(String(existingRecord.data().lastFourCharacters || ""))
    : "";
  const identifier = normalizedIdentifier(record.student.lastFourCharacters);
  const dates = record.rows
    .map((row) => row.date)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const operations: FirestoreOperation[] = existingEntries.docs.map((entry) => ({
    type: "delete",
    reference: entry.ref
  }));

  operations.push({
    type: "set",
    reference: recordReference,
    data: {
      id: record.id,
      studentName: record.student.studentName.trim(),
      studentNameLower: record.student.studentName.trim().toLowerCase(),
      company: record.student.company.trim(),
      companyLower: record.student.company.trim().toLowerCase(),
      lastFourCharacters: identifier,
      flightCount: record.rows.length,
      totalDurationMinutes: record.rows.reduce(
        (total, row) => total + (Number(row.duration) || 0),
        0
      ),
      firstFlightDate: dates[0] || "",
      lastFlightDate: dates[dates.length - 1] || "",
      createdAt: safeTimestamp(record.createdAt),
      updatedAt: safeTimestamp(record.updatedAt),
      source: "live-google-mirror",
      schemaVersion: 1
    }
  });

  if (previousIdentifier && previousIdentifier !== identifier) {
    operations.push({
      type: "delete",
      reference: doc(
        firestore,
        "flightLogIdentifiers",
        identifierDocumentId(previousIdentifier)
      )
    });
  }

  if (identifier) {
    operations.push({
      type: "set",
      reference: doc(
        firestore,
        "flightLogIdentifiers",
        identifierDocumentId(identifier)
      ),
      data: {
        identifier,
        recordId: record.id,
        studentName: record.student.studentName.trim(),
        updatedAt: Timestamp.now()
      }
    });
  }

  const signatureReference = doc(firestore, "flightLogSignatures", record.id);
  if (record.student.studentSignatureDataUrl) {
    operations.push({
      type: "set",
      reference: signatureReference,
      data: {
        recordId: record.id,
        dataUrl: record.student.studentSignatureDataUrl,
        updatedAt: safeTimestamp(record.updatedAt),
        schemaVersion: 1
      }
    });
  } else {
    operations.push({ type: "delete", reference: signatureReference });
  }

  record.rows.forEach((row, index) => {
    const entryId = deterministicEntryId(record.id, index);
    operations.push({
      type: "set",
      reference: doc(firestore, "flightEntries", entryId),
      data: {
        id: entryId,
        recordId: record.id,
        studentName: record.student.studentName.trim(),
        company: record.student.company.trim(),
        lastFourCharacters: identifier,
        date: row.date,
        dateTimestamp: dateTimestamp(row.date),
        month: /^\d{4}-\d{2}/.test(row.date) ? Number(row.date.slice(5, 7)) : null,
        year: /^\d{4}/.test(row.date) ? Number(row.date.slice(0, 4)) : null,
        location: row.location,
        startTime: row.startTime,
        durationMinutes: Number(row.duration) || 0,
        uaModel: row.uaModel,
        uaCategory: row.uaCategory,
        batterySn: row.batterySn,
        pilotInCommand: row.pilotInCommand,
        instructorInCommand: row.instructorInCommand,
        remarks: row.remarks,
        sourceRowIndex: index,
        schemaVersion: 1
      }
    });
  });

  await commitOperations(operations);
  return record;
}

export async function deleteFirebaseFlightLogRecord(recordId: string) {
  const user = await requireFirebaseUser();

  const recordReference = doc(firestore, "flightLogRecords", recordId);
  const [recordSnapshot, entrySnapshot] = await Promise.all([
    getDoc(recordReference),
    getDocs(
      query(
        collection(firestore, "flightEntries"),
        where("recordId", "==", recordId)
      )
    )
  ]);
  const identifier = recordSnapshot.exists()
    ? normalizedIdentifier(String(recordSnapshot.data().lastFourCharacters || ""))
    : "";
  const operations: FirestoreOperation[] = entrySnapshot.docs.map((entry) => ({
    type: "delete",
    reference: entry.ref
  }));

  operations.push(
    { type: "delete", reference: recordReference },
    {
      type: "delete",
      reference: doc(firestore, "flightLogSignatures", recordId)
    },
    {
      type: "set",
      reference: doc(firestore, "flightLogTombstones", recordId),
      data: {
        recordId,
        studentName: recordSnapshot.exists()
          ? String(recordSnapshot.data().studentName || "")
          : "",
        deletedAt: Timestamp.now(),
        deletedByUid: user.uid,
        deletedByEmail: user.email || "",
        schemaVersion: 1
      }
    }
  );

  if (identifier) {
    operations.push({
      type: "delete",
      reference: doc(
        firestore,
        "flightLogIdentifiers",
        identifierDocumentId(identifier)
      )
    });
  }

  const reservationIds = Array.from(
    new Set(
      entrySnapshot.docs.map((entry) =>
        batteryReservationKey(rowFromDocument(entry.data()))
      )
    )
  );
  const reservationSnapshots = await Promise.all(
    reservationIds.map((id) =>
      getDoc(doc(firestore, "flightBatteryReservations", id))
    )
  );
  reservationSnapshots.forEach((snapshot) => {
    if (snapshot.exists() && String(snapshot.data().recordId || "") === recordId) {
      operations.push({ type: "delete", reference: snapshot.ref });
    }
  });

  await commitOperations(operations);
}
