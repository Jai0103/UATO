import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch
} from "firebase/firestore";
import type { FlightLogRecord } from "@/lib/flight-log-storage";
import {
  googleAppsScriptUrl,
  type RecordsPageResponse
} from "@/lib/google-api";
import { firestore } from "@/lib/firebase-client";
import { sessionKey } from "@/lib/demo-auth";

const PAGE_SIZE = 25;
const DETAIL_BATCH_SIZE = 2;
const WRITE_BATCH_SIZE = 400;
const MAX_SIGNATURE_BYTES = 750_000;
const MIGRATION_READ_TIMEOUT_MS = 90_000;
const MIGRATION_READ_ATTEMPTS = 3;

export type MigrationProgress = {
  phase: "loading" | "writing";
  current: number;
  total: number;
  label: string;
};

export type MigrationAnalysis = {
  records: FlightLogRecord[];
  recordCount: number;
  flightCount: number;
  signatureCount: number;
  duplicateIdentifiers: string[];
  oversizedSignatures: string[];
};

export type MigrationVerification = {
  verified: boolean;
  expected: {
    records: number;
    flights: number;
    signatures: number;
    identifiers: number;
  };
  actual: {
    records: number;
    flights: number;
    signatures: number;
    identifiers: number;
  };
  mismatches: string[];
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

function normalizedIdentifier(value: string) {
  return value.trim().toUpperCase();
}

function identifierDocumentId(value: string) {
  return normalizedIdentifier(value).replace(/[^A-Z0-9_-]/g, "-");
}

function safeTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function dateTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function signatureSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function deterministicEntryId(recordId: string, index: number) {
  const safeRecordId = recordId.replace(/\//g, "_");
  return `${safeRecordId}-${String(index + 1).padStart(5, "0")}`;
}

function migrationSessionToken() {
  try {
    const rawSession = localStorage.getItem(sessionKey);
    if (!rawSession) return "";
    const session = JSON.parse(rawSession) as { sessionToken?: string };
    return String(session.sessionToken || "");
  } catch {
    return "";
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function migrationGooglePost<T>(payload: Record<string, unknown>) {
  const sessionToken = migrationSessionToken();
  if (!sessionToken) {
    throw new Error(
      "Your normal application session has expired. Sign in again before migration."
    );
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MIGRATION_READ_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      MIGRATION_READ_TIMEOUT_MS
    );

    try {
      const response = await fetch(googleAppsScriptUrl, {
        method: "POST",
        body: JSON.stringify({ ...payload, sessionToken }),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Google Sheets returned HTTP ${response.status}.`);
      }

      const data = (await response.json()) as T & {
        ok?: boolean;
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (data.ok === false || data.success === false) {
        throw new Error(
          data.error || data.message || "Google Sheets rejected the request."
        );
      }

      return data;
    } catch (error) {
      lastError = error;
      if (attempt < MIGRATION_READ_ATTEMPTS) {
        await wait(attempt * 1_500);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (lastError instanceof DOMException && lastError.name === "AbortError") {
    throw new Error(
      "Google Sheets did not respond after three extended attempts. Wait one minute and retry."
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load Google Sheets for migration.");
}

async function migrationRecordsPage(page: number) {
  const data = await migrationGooglePost<RecordsPageResponse>({
    action: "getRecordsPage",
    page,
    pageSize: PAGE_SIZE,
    query: "",
    month: "",
    year: ""
  });

  return {
    records: data.records || [],
    totalRecords: Number(data.totalRecords) || 0,
    totalPages: Math.max(1, Number(data.totalPages) || 1)
  };
}

async function migrationRecordsByIds(recordIds: string[]) {
  const data = await migrationGooglePost<{ records: FlightLogRecord[] }>({
    action: "getRecordsByIds",
    recordIds
  });

  return data.records || [];
}

async function commitOperations(operations: FirestoreOperation[]) {
  for (let start = 0; start < operations.length; start += WRITE_BATCH_SIZE) {
    const batch = writeBatch(firestore);
    const group = operations.slice(start, start + WRITE_BATCH_SIZE);

    group.forEach((operation) => {
      if (operation.type === "delete") {
        batch.delete(operation.reference);
      } else {
        batch.set(operation.reference, operation.data);
      }
    });

    await batch.commit();
  }
}

export async function loadAllGoogleFlightLogs(
  onProgress?: (progress: MigrationProgress) => void
) {
  const firstPage = await migrationRecordsPage(1);
  const summaries = [...firstPage.records];

  onProgress?.({
    phase: "loading",
    current: Math.min(summaries.length, firstPage.totalRecords),
    total: firstPage.totalRecords,
    label: "Loading record index"
  });

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const response = await migrationRecordsPage(page);
    summaries.push(...response.records);
    onProgress?.({
      phase: "loading",
      current: Math.min(summaries.length, firstPage.totalRecords),
      total: firstPage.totalRecords,
      label: "Loading record index"
    });
  }

  const uniqueIds = Array.from(
    new Set(summaries.map((record) => record.id).filter(Boolean))
  );
  const records: FlightLogRecord[] = [];

  for (let start = 0; start < uniqueIds.length; start += DETAIL_BATCH_SIZE) {
    const ids = uniqueIds.slice(start, start + DETAIL_BATCH_SIZE);
    const loadedRecords = await migrationRecordsByIds(ids);
    records.push(...loadedRecords);
    onProgress?.({
      phase: "loading",
      current: Math.min(start + ids.length, uniqueIds.length),
      total: uniqueIds.length,
      label: "Loading complete flight logs"
    });
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  return uniqueIds
    .map((id) => recordsById.get(id))
    .filter((record): record is FlightLogRecord => Boolean(record));
}

export function analyzeFlightLogMigration(
  records: FlightLogRecord[]
): MigrationAnalysis {
  const identifiers = new Map<string, string[]>();
  const oversizedSignatures: string[] = [];

  records.forEach((record) => {
    const identifier = normalizedIdentifier(
      record.student.lastFourCharacters
    );
    const names = identifiers.get(identifier) || [];
    names.push(record.student.studentName || record.id);
    identifiers.set(identifier, names);

    const signature = record.student.studentSignatureDataUrl || "";
    if (signature && signatureSize(signature) > MAX_SIGNATURE_BYTES) {
      oversizedSignatures.push(record.student.studentName || record.id);
    }
  });

  const duplicateIdentifiers = Array.from(identifiers.entries())
    .filter(([identifier, names]) => identifier && names.length > 1)
    .map(([identifier, names]) => `${identifier}: ${names.join(", ")}`);

  return {
    records,
    recordCount: records.length,
    flightCount: records.reduce(
      (total, record) => total + record.rows.length,
      0
    ),
    signatureCount: records.filter(
      (record) => Boolean(record.student.studentSignatureDataUrl)
    ).length,
    duplicateIdentifiers,
    oversizedSignatures
  };
}

export async function migrateFlightLogsToFirestore(
  analysis: MigrationAnalysis,
  migratedBy: { uid: string; email: string },
  onProgress?: (progress: MigrationProgress) => void
) {
  if (analysis.duplicateIdentifiers.length) {
    throw new Error("Resolve duplicate last-four identifiers before migration.");
  }

  if (analysis.oversizedSignatures.length) {
    throw new Error("Compress oversized signatures before migration.");
  }

  for (let index = 0; index < analysis.records.length; index += 1) {
    const record = analysis.records[index];
    const identifier = normalizedIdentifier(
      record.student.lastFourCharacters
    );
    const dates = record.rows
      .map((row) => row.date)
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort();
    const existingEntries = await getDocs(
      query(
        collection(firestore, "flightEntries"),
        where("recordId", "==", record.id)
      )
    );
    const operations: FirestoreOperation[] = existingEntries.docs.map(
      (entry) => ({ type: "delete", reference: entry.ref })
    );

    operations.push({
      type: "set",
      reference: doc(firestore, "flightLogRecords", record.id),
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
        source: "google-sheets-migration",
        schemaVersion: 1
      }
    });

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

    const signature = record.student.studentSignatureDataUrl || "";
    const signatureReference = doc(
      firestore,
      "flightLogSignatures",
      record.id
    );

    operations.push(
      signature
        ? {
            type: "set",
            reference: signatureReference,
            data: {
              recordId: record.id,
              dataUrl: signature,
              byteLength: signatureSize(signature),
              updatedAt: safeTimestamp(record.updatedAt),
              schemaVersion: 1
            }
          }
        : {
            type: "delete",
            reference: signatureReference
          }
    );

    record.rows.forEach((row, rowIndex) => {
      const entryId = deterministicEntryId(record.id, rowIndex);
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
          month: /^\d{4}-\d{2}/.test(row.date)
            ? Number(row.date.slice(5, 7))
            : null,
          year: /^\d{4}/.test(row.date)
            ? Number(row.date.slice(0, 4))
            : null,
          location: row.location,
          startTime: row.startTime,
          durationMinutes: Number(row.duration) || 0,
          uaModel: row.uaModel,
          uaCategory: row.uaCategory,
          batterySn: row.batterySn,
          pilotInCommand: row.pilotInCommand,
          instructorInCommand: row.instructorInCommand,
          remarks: row.remarks,
          sourceRowIndex: rowIndex,
          schemaVersion: 1
        }
      });
    });

    await commitOperations(operations);
    onProgress?.({
      phase: "writing",
      current: index + 1,
      total: analysis.records.length,
      label: record.student.studentName || record.id
    });
  }

  const runId = `flight-logs-${Date.now()}`;
  await setDoc(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "flight-logs",
    recordCount: analysis.recordCount,
    flightCount: analysis.flightCount,
    signatureCount: analysis.signatureCount,
    migratedByUid: migratedBy.uid,
    migratedByEmail: migratedBy.email,
    completedAt: Timestamp.now(),
    source: "google-sheets"
  });

  return { runId };
}

function comparableRecord(record: FlightLogRecord) {
  const dates = record.rows
    .map((row) => row.date)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  return {
    id: record.id,
    studentName: record.student.studentName.trim(),
    company: record.student.company.trim(),
    lastFourCharacters: normalizedIdentifier(
      record.student.lastFourCharacters
    ),
    flightCount: record.rows.length,
    totalDurationMinutes: record.rows.reduce(
      (total, row) => total + (Number(row.duration) || 0),
      0
    ),
    firstFlightDate: dates[0] || "",
    lastFlightDate: dates[dates.length - 1] || ""
  };
}

function comparableEntry(
  record: FlightLogRecord,
  rowIndex: number
) {
  const row = record.rows[rowIndex];
  return {
    id: deterministicEntryId(record.id, rowIndex),
    recordId: record.id,
    studentName: record.student.studentName.trim(),
    company: record.student.company.trim(),
    lastFourCharacters: normalizedIdentifier(
      record.student.lastFourCharacters
    ),
    date: row.date,
    location: row.location,
    startTime: row.startTime,
    durationMinutes: Number(row.duration) || 0,
    uaModel: row.uaModel,
    uaCategory: row.uaCategory,
    batterySn: row.batterySn,
    pilotInCommand: row.pilotInCommand,
    instructorInCommand: row.instructorInCommand,
    remarks: row.remarks,
    sourceRowIndex: rowIndex
  };
}

function pickComparableData(
  data: DocumentData,
  keys: string[]
) {
  return Object.fromEntries(keys.map((key) => [key, data[key]]));
}

export async function verifyFlightLogMigration(
  analysis: MigrationAnalysis
): Promise<MigrationVerification> {
  const [recordSnapshot, entrySnapshot, signatureSnapshot, identifierSnapshot] =
    await Promise.all([
      getDocs(collection(firestore, "flightLogRecords")),
      getDocs(collection(firestore, "flightEntries")),
      getDocs(collection(firestore, "flightLogSignatures")),
      getDocs(collection(firestore, "flightLogIdentifiers"))
    ]);

  const actualRecords = new Map(
    recordSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()])
  );
  const actualEntries = new Map(
    entrySnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()])
  );
  const actualSignatures = new Map(
    signatureSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()])
  );
  const actualIdentifiers = new Map(
    identifierSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()])
  );
  const expectedRecordIds = new Set<string>();
  const expectedEntryIds = new Set<string>();
  const expectedSignatureIds = new Set<string>();
  const expectedIdentifierIds = new Set<string>();
  const mismatches: string[] = [];

  function addMismatch(message: string) {
    if (mismatches.length < 100) mismatches.push(message);
  }

  analysis.records.forEach((record) => {
    expectedRecordIds.add(record.id);
    const expectedRecord = comparableRecord(record);
    const actualRecord = actualRecords.get(record.id);

    if (!actualRecord) {
      addMismatch(`Missing student record: ${record.student.studentName}`);
    } else {
      const actualComparable = pickComparableData(
        actualRecord,
        Object.keys(expectedRecord)
      );
      if (JSON.stringify(actualComparable) !== JSON.stringify(expectedRecord)) {
        addMismatch(`Student summary differs: ${record.student.studentName}`);
      }
    }

    record.rows.forEach((_, rowIndex) => {
      const expectedEntry = comparableEntry(record, rowIndex);
      expectedEntryIds.add(expectedEntry.id);
      const actualEntry = actualEntries.get(expectedEntry.id);

      if (!actualEntry) {
        addMismatch(
          `Missing flight ${rowIndex + 1}: ${record.student.studentName}`
        );
        return;
      }

      const actualComparable = pickComparableData(
        actualEntry,
        Object.keys(expectedEntry)
      );
      if (JSON.stringify(actualComparable) !== JSON.stringify(expectedEntry)) {
        addMismatch(
          `Flight ${rowIndex + 1} differs: ${record.student.studentName}`
        );
      }
    });

    const signature = record.student.studentSignatureDataUrl || "";
    if (signature) {
      expectedSignatureIds.add(record.id);
      if (actualSignatures.get(record.id)?.dataUrl !== signature) {
        addMismatch(`Signature differs: ${record.student.studentName}`);
      }
    }

    const identifier = normalizedIdentifier(
      record.student.lastFourCharacters
    );
    if (identifier) {
      const identifierId = identifierDocumentId(identifier);
      expectedIdentifierIds.add(identifierId);
      const identifierData = actualIdentifiers.get(identifierId);
      if (
        identifierData?.identifier !== identifier ||
        identifierData?.recordId !== record.id
      ) {
        addMismatch(`Identifier differs: ${record.student.studentName}`);
      }
    }
  });

  actualRecords.forEach((_, id) => {
    if (!expectedRecordIds.has(id)) addMismatch(`Extra student record: ${id}`);
  });
  actualEntries.forEach((_, id) => {
    if (!expectedEntryIds.has(id)) addMismatch(`Extra flight entry: ${id}`);
  });
  actualSignatures.forEach((_, id) => {
    if (!expectedSignatureIds.has(id)) addMismatch(`Extra signature: ${id}`);
  });
  actualIdentifiers.forEach((_, id) => {
    if (!expectedIdentifierIds.has(id)) addMismatch(`Extra identifier: ${id}`);
  });

  const expected = {
    records: expectedRecordIds.size,
    flights: expectedEntryIds.size,
    signatures: expectedSignatureIds.size,
    identifiers: expectedIdentifierIds.size
  };
  const actual = {
    records: actualRecords.size,
    flights: actualEntries.size,
    signatures: actualSignatures.size,
    identifiers: actualIdentifiers.size
  };

  return {
    verified:
      mismatches.length === 0 &&
      JSON.stringify(expected) === JSON.stringify(actual),
    expected,
    actual,
    mismatches
  };
}
