import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import type {
  FlightLogRecord,
  FlightLogRow
} from "@/lib/flight-log-storage";
import type {
  FlightLogRecordSummary,
  RecordsPageRequest,
  RecordsPageResponse
} from "@/lib/google-api";

const WRITE_BATCH_SIZE = 400;

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
  await requireFirebaseUser();

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

  await commitOperations(operations);
}
