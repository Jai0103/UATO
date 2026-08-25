import type {
  FlightLogRecord
} from "@/lib/flight-log-storage";
import type {
  MasterData
} from "@/lib/master-data";
import type {
  ManagedUser
} from "@/lib/user-storage";
import {
  sessionKey
} from "@/lib/demo-auth";
import { supabase } from "@/lib/supabase";

export const googleAppsScriptUrl =
  "https://script.google.com/macros/s/AKfycbwjmTFIGbGSHhaxj9ds86l5_Vgx6vuovgQZpfNRSexZH5T336eLEylJiWoKaPkAkHnZPg/exec";

type ApiResponse<T> = {
  ok?: boolean;
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
} & T;

type StoredSession = {
  sessionToken?: string;
  expiresAt?: string;
};

type ApiCacheConfig = {
  ttlMs: number;
  persist: boolean;
};

type ApiCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const API_CACHE_PREFIX = "uapl-api-cache-v4:";
const MAX_PERSISTED_CACHE_ENTRIES = 40;
const API_READ_TIMEOUT_MS = 22_000;
const API_WRITE_TIMEOUT_MS = 75_000;
const apiMemoryCache = new Map<string, ApiCacheEntry>();
const apiRequestsInFlight = new Map<string, Promise<unknown>>();

const API_READ_CACHE: Record<string, ApiCacheConfig> = {
  getAdminDashboardBundle: { ttlMs: 30_000, persist: false },
  getDashboardStats: { ttlMs: 30_000, persist: false },
  getApprovalDashboardSummary: { ttlMs: 30_000, persist: false },
  getFatigueRiskWeeklyStatus: { ttlMs: 30_000, persist: false },
  getMasterData: { ttlMs: 5 * 60_000, persist: true },
  getMasterDataCatalog: { ttlMs: 5 * 60_000, persist: true },
  getInventoryMasterData: { ttlMs: 5 * 60_000, persist: true },
  getInventoryDashboard: { ttlMs: 30_000, persist: false },
  getUaMaintenanceMasterData: { ttlMs: 5 * 60_000, persist: true },
  getStaffTrainingDescriptions: { ttlMs: 5 * 60_000, persist: true },
  getUsers: { ttlMs: 2 * 60_000, persist: false },
  getRecordsPage: { ttlMs: 30_000, persist: true },
  getRecordsByIds: { ttlMs: 30_000, persist: false },
  getStaffTrainingRecords: { ttlMs: 10_000, persist: false },
  getStaffTrainingRecordsPage: { ttlMs: 10_000, persist: false },
  getUaMaintenanceRecordsPage: { ttlMs: 10_000, persist: false },
  getFatigueRiskRecordsPage: { ttlMs: 10_000, persist: false },
  getInventoryAssetsPage: { ttlMs: 10_000, persist: false },
  getInventoryActivityPage: { ttlMs: 10_000, persist: false },
  getApprovalsPage: { ttlMs: 10_000, persist: false },
  getAuditHistoryPage: { ttlMs: 20_000, persist: false },
  getEvaluationSessionsPage: { ttlMs: 20_000, persist: false },
  getEvaluationResponsesPage: { ttlMs: 20_000, persist: false },
  getEvaluationQuestions: { ttlMs: 5 * 60_000, persist: true },
  getRecordById: { ttlMs: 45_000, persist: false },
  getStaffTrainingRecord: { ttlMs: 45_000, persist: false },
  getUaMaintenanceRecord: { ttlMs: 45_000, persist: false },
  getFatigueRiskRecord: { ttlMs: 45_000, persist: false },
  getInventoryAsset: { ttlMs: 45_000, persist: false },
  getApprovalRecord: { ttlMs: 45_000, persist: false },
  getAuditHistoryDetail: { ttlMs: 30_000, persist: false },
  getUnavailableBatteriesForDate: { ttlMs: 20_000, persist: false }
};

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";

  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([key, entry]) =>
        `${JSON.stringify(key)}:${stableSerialize(entry)}`
    )
    .join(",")}}`;
}

function hashCacheValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function apiCacheKey(
  sessionToken: string,
  payload: Record<string, unknown>
) {
  const action = String(payload.action || "request");
  const sessionFingerprint = hashCacheValue(sessionToken);
  const payloadFingerprint = hashCacheValue(stableSerialize(payload));
  return `${API_CACHE_PREFIX}${sessionFingerprint}:${action}:${payloadFingerprint}`;
}

function readApiCache<T>(
  key: string,
  config: ApiCacheConfig
): T | undefined {
  const now = Date.now();
  const memoryEntry = apiMemoryCache.get(key);

  if (memoryEntry) {
    if (memoryEntry.expiresAt > now) {
      return memoryEntry.value as T;
    }
    apiMemoryCache.delete(key);
  }

  if (!config.persist || typeof window === "undefined") {
    return undefined;
  }

  try {
    const rawEntry = sessionStorage.getItem(key);
    if (!rawEntry) return undefined;

    const entry = JSON.parse(rawEntry) as ApiCacheEntry;
    if (!entry.expiresAt || entry.expiresAt <= now) {
      sessionStorage.removeItem(key);
      return undefined;
    }

    apiMemoryCache.set(key, entry);
    return entry.value as T;
  } catch {
    return undefined;
  }
}

function trimPersistedApiCache() {
  if (typeof window === "undefined") return;

  try {
    const entries: Array<{ key: string; expiresAt: number }> = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(API_CACHE_PREFIX)) continue;

      try {
        const entry = JSON.parse(
          sessionStorage.getItem(key) || "{}"
        ) as ApiCacheEntry;
        entries.push({ key, expiresAt: Number(entry.expiresAt) || 0 });
      } catch {
        sessionStorage.removeItem(key);
      }
    }

    entries
      .sort((first, second) => second.expiresAt - first.expiresAt)
      .slice(MAX_PERSISTED_CACHE_ENTRIES)
      .forEach((entry) => sessionStorage.removeItem(entry.key));
  } catch {
    // Storage limits must never prevent the online request from succeeding.
  }
}

function writeApiCache(
  key: string,
  config: ApiCacheConfig,
  value: unknown
) {
  const entry: ApiCacheEntry = {
    expiresAt: Date.now() + config.ttlMs,
    value
  };
  apiMemoryCache.set(key, entry);

  if (!config.persist || typeof window === "undefined") return;

  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
    trimPersistedApiCache();
  } catch {
    // Large responses remain available in memory when storage is full.
  }
}

export function invalidateGoogleApiCache() {
  apiMemoryCache.clear();
  apiRequestsInFlight.clear();

  if (typeof window === "undefined") return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(API_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Cache invalidation is best-effort and must not block saved changes.
  }
}

function actionChangesData(action: string) {
  return (
    /^(save|delete|archive|create|update|setup|set|reset|rebuild)/i.test(
      action
    ) ||
    [
      "submitPublicEvaluation",
      "closeEvaluationSession",
      "secureChangePassword"
    ].includes(action)
  );
}

const PAGINATED_READ_ACTIONS = new Set([
  "getRecordsPage",
  "getStaffTrainingRecordsPage",
  "getUaMaintenanceRecordsPage",
  "getFatigueRiskRecordsPage",
  "getInventoryAssetsPage",
  "getInventoryActivityPage",
  "getApprovalsPage",
  "getAuditHistoryPage",
  "getEvaluationSessionsPage",
  "getEvaluationResponsesPage"
]);

function shouldCacheApiResponse(action: string, value: unknown) {
  if (!PAGINATED_READ_ACTIONS.has(action)) return true;
  if (!value || typeof value !== "object") return false;

  const response = value as Record<string, unknown>;
  const collections = [
    response.records,
    response.assets,
    response.activities,
    response.sessions,
    response.responses
  ];
  const collection = collections.find(Array.isArray);

  return !Array.isArray(collection) || collection.length > 0;
}

export type FlightLogRecordSummary = {
  id: string;
  student: {
    studentName: string;
    company: string;
    lastFourCharacters: string;
    studentSignatureDataUrl: string;
  };
  rows: [];
  flightCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecordsPageRequest = {
  page?: number;
  pageSize?: number;
  query?: string;
  month?: string;
  year?: string;
};

export type RecordsPageResponse = {
  records: FlightLogRecordSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export class GoogleApiError extends Error {
  code: string;

  constructor(
    message: string,
    code = "GOOGLE_API_ERROR"
  ) {
    super(message);

    this.name = "GoogleApiError";
    this.code = code;
  }
}

function getStoredSessionToken() {
  if (
    typeof window === "undefined"
  ) {
    return "";
  }

  const rawSession =
    localStorage.getItem(
      sessionKey
    );

  if (!rawSession) {
    return "";
  }

  try {
    const session =
      JSON.parse(
        rawSession
      ) as StoredSession;

    if (
      !session.sessionToken ||
      !session.expiresAt
    ) {
      return "";
    }

    const expiresAt =
      new Date(
        session.expiresAt
      ).getTime();

    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      localStorage.removeItem(
        sessionKey
      );

      return "";
    }

    return session.sessionToken;
  } catch {
    localStorage.removeItem(
      sessionKey
    );

    return "";
  }
}

function handleAuthenticationError(
  code?: string
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  if (
    code === "AUTH_REQUIRED"
  ) {
    invalidateGoogleApiCache();

    localStorage.removeItem(
      sessionKey
    );

    window.dispatchEvent(
      new CustomEvent(
        "uapl-auth-expired"
      )
    );
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function fetchGoogleOnce(
  requestBody: string,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(googleAppsScriptUrl, {
      method: "POST",
      body: requestBody,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GoogleApiError(
        "Google Sheets took too long to respond. Please try again.",
        "REQUEST_TIMEOUT"
      );
    }

    throw new GoogleApiError(
      "Unable to connect to Google Sheets. Check your internet connection.",
      "NETWORK_ERROR"
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function postToGoogle<T>(
  payload: Record<string, unknown>
): Promise<T> {
  const sessionToken =
    getStoredSessionToken();

  if (!sessionToken) {
    throw new GoogleApiError(
      "Your session has expired. Please sign in again.",
      "AUTH_REQUIRED"
    );
  }

  const action = String(payload.action || "");
  const cacheConfig = API_READ_CACHE[action];
  const cacheKey = cacheConfig
    ? apiCacheKey(sessionToken, payload)
    : "";

  if (cacheConfig) {
    const cached = readApiCache<T>(cacheKey, cacheConfig);
    if (cached !== undefined) return cached;

    const existingRequest = apiRequestsInFlight.get(cacheKey);
    if (existingRequest) return existingRequest as Promise<T>;
  }

  const request = (async () => {
    let response: Response;
    const timeoutMs = actionChangesData(action)
      ? API_WRITE_TIMEOUT_MS
      : API_READ_TIMEOUT_MS;
    const requestBody = JSON.stringify({ ...payload, sessionToken });

    try {
      response = await fetchGoogleOnce(requestBody, timeoutMs);
    } catch (error) {
      const retryable =
        Boolean(cacheConfig) &&
        error instanceof GoogleApiError &&
        ["REQUEST_TIMEOUT", "NETWORK_ERROR"].includes(error.code);

      if (!retryable) throw error;

      // Read requests are safe to retry. Writes are deliberately never retried
      // because the first Apps Script execution may already have committed.
      await wait(450);
      response = await fetchGoogleOnce(requestBody, timeoutMs);
    }

    if (!response.ok) {
      throw new GoogleApiError(
        "The Google service returned an error.",
        "HTTP_ERROR"
      );
    }

    let data: ApiResponse<T>;

    try {
      data =
        (await response.json()) as
          ApiResponse<T>;
    } catch {
      throw new GoogleApiError(
        "The Google service returned an invalid response.",
        "INVALID_RESPONSE"
      );
    }

    if (
      data.ok === false ||
      data.success === false
    ) {
      const code =
        data.code ||
        "GOOGLE_API_ERROR";

      handleAuthenticationError(code);

      throw new GoogleApiError(
        data.error ||
          data.message ||
          "Google API request failed.",
        code
      );
    }

    if (cacheConfig && shouldCacheApiResponse(action, data)) {
      writeApiCache(cacheKey, cacheConfig, data);
    } else if (actionChangesData(action)) {
      invalidateGoogleApiCache();
    }

    return data as T;
  })();

  if (cacheConfig) {
    apiRequestsInFlight.set(cacheKey, request);
  }

  try {
    return await request;
  } finally {
    if (cacheConfig) apiRequestsInFlight.delete(cacheKey);
  }
}



/*
 * Paginated record summaries.
 * Signatures and flight rows are not downloaded.
 */
export async function fetchGoogleRecordsPage(
  request: RecordsPageRequest = {}
): Promise<RecordsPageResponse> {
  const page = request.page || 1;
  const pageSize = request.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const query = request.query?.trim().toLowerCase() || "";

  const { data, error, count } = await supabase
    .from("flight_logs")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new GoogleApiError(error.message, "SUPABASE_ERROR");
  }

  const filtered = (data || []).filter((row) => {
    if (!query) return true;

    return [
      row.student_name,
      row.company,
      row.last_four_characters
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const records: FlightLogRecordSummary[] = filtered.map((row) => ({
    id: row.id,
    student: {
      studentName: row.student_name || "",
      company: row.company || "",
      lastFourCharacters: row.last_four_characters || "",
      studentSignatureDataUrl: row.signature_file_id || ""
    },
    rows: [],
    flightCount: Array.isArray(row.rows_json) ? row.rows_json.length : 0,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  }));

  const totalRecords = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return {
    records,
    page,
    pageSize,
    totalRecords,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  };
}

/*
 * Load one complete student record only
 * when the user opens or continues it.
 */
export async function fetchGoogleRecordById(
  recordId: string
) {
  const { data, error } = await supabase
    .from("flight_logs")
    .select("*")
    .eq("id", recordId)
    .single();

  if (error) {
    throw new GoogleApiError(
      error.message,
      "SUPABASE_ERROR"
    );
  }

  return {
    id: data.id,
    student: {
      studentName: data.student_name || "",
      company: data.company || "",
      lastFourCharacters: data.last_four_characters || "",
      studentSignatureDataUrl: data.signature_file_id || ""
    },
    rows: data.rows_json || [],
    createdAt: data.created_at || "",
    updatedAt: data.updated_at || ""
  };
}

/*
 * Load selected complete records for
 * combined PDF generation.
 */
export async function fetchGoogleRecordsByIds(
  recordIds: string[]
) {
  const uniqueIds =
    Array.from(
      new Set(
        recordIds.filter(Boolean)
      )
    ).slice(0, 25);

  if (!uniqueIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("flight_logs")
    .select("*")
    .in("id", uniqueIds);

  if (error) {
    throw new GoogleApiError(
      error.message,
      "SUPABASE_ERROR"
    );
  }

  return (data || []).map((row) => ({
    id: row.id,
    student: {
      studentName: row.student_name || "",
      company: row.company || "",
      lastFourCharacters: row.last_four_characters || "",
      studentSignatureDataUrl: row.signature_file_id || ""
    },
    rows: row.rows_json || [],
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  }));
}

function flightEntryStartMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export async function saveGoogleRecord(
  record: FlightLogRecord
) {
  const now = new Date().toISOString();
  const createdAt = record.createdAt || now;
  const updatedAt = now;
  const flightCount = record.rows.length;
  const totalMinutes = record.rows.reduce(
    (sum, row) => sum + (Number(row.duration) || 0),
    0
  );

  const datedRows = record.rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort();

  const firstFlightDate = datedRows[0] || null;
  const lastFlightDate =
    datedRows[datedRows.length - 1] || null;

  const searchText = [
    record.student.studentName,
    record.student.company,
    record.student.lastFourCharacters
  ]
    .join(" ")
    .toLowerCase();

  const flightLogRow = {
    id: record.id,
    student_name: record.student.studentName,
    company: record.student.company,
    last_four_characters: record.student.lastFourCharacters,
    signature_file_id: record.student.studentSignatureDataUrl,
    rows_json: record.rows,
    created_at: createdAt,
    updated_at: updatedAt
  };

  const indexRow = {
    record_id: record.id,
    student_name: record.student.studentName,
    company: record.student.company,
    last_four_characters: record.student.lastFourCharacters,
    signature_file_id: record.student.studentSignatureDataUrl,
    flight_count: flightCount,
    total_minutes: totalMinutes,
    first_flight_date: firstFlightDate,
    last_flight_date: lastFlightDate,
    created_at: createdAt,
    updated_at: updatedAt,
    search_text: searchText
  };

  const entries = record.rows.map((row, index) => {
    const startMinutes = flightEntryStartMinutes(row.startTime);
    const duration = Number(row.duration) || 0;
    const endMinutes =
      startMinutes === null ? null : startMinutes + duration;

    return {
      entry_id:
        `${record.id}-${index + 1}-${crypto.randomUUID()}`,
      record_id: record.id,
      row_order: index + 1,
      student_name: record.student.studentName,
      date: row.date || null,
      month: row.date ? Number(row.date.slice(5, 7)) : null,
      year: row.date ? Number(row.date.slice(0, 4)) : null,
      location: row.location,
      start_time: row.startTime,
      start_minutes: startMinutes,
      duration,
      end_minutes: endMinutes,
      ua_model: row.uaModel,
      ua_category: row.uaCategory,
      battery_sn: row.batterySn,
      pilot_in_command: row.pilotInCommand,
      instructor_in_command: row.instructorInCommand,
      remarks: row.remarks,
      duplicate_key: [
        row.date,
        row.location,
        row.startTime,
        row.uaModel,
        row.batterySn
      ].join("|").toLowerCase(),
      created_at: createdAt,
      updated_at: updatedAt
    };
  });

  const logResult = await supabase
    .from("flight_logs")
    .upsert(flightLogRow, { onConflict: "id" });

  if (logResult.error) {
    throw new GoogleApiError(
      logResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  const indexResult = await supabase
    .from("flight_record_index")
    .upsert(indexRow, { onConflict: "record_id" });

  if (indexResult.error) {
    throw new GoogleApiError(
      indexResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  const deleteEntriesResult = await supabase
    .from("flight_entries")
    .delete()
    .eq("record_id", record.id);

  if (deleteEntriesResult.error) {
    throw new GoogleApiError(
      deleteEntriesResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  if (entries.length) {
    const entriesResult = await supabase
      .from("flight_entries")
      .insert(entries);

    if (entriesResult.error) {
      throw new GoogleApiError(
        entriesResult.error.message,
        "SUPABASE_ERROR"
      );
    }
  }

  invalidateGoogleApiCache();

  return {
    ...record,
    createdAt,
    updatedAt
  };
}

export async function fetchGoogleMasterData() {
  const { data, error } = await supabase
    .from("master_data")
    .select("section, value, status")
    .eq("status", "active")
    .order("value", { ascending: true });

  if (error) {
    throw new GoogleApiError(
      error.message,
      "SUPABASE_ERROR"
    );
  }

  const masterData: MasterData = {
    locations: [],
    batterySerialNumbers: [],
    afeInstructors: [],
    uaModels: [],
    uaCategories: []
  };

  for (const row of data || []) {
    const section = row.section as keyof MasterData;

    if (section in masterData && row.value) {
      masterData[section].push(row.value);
    }
  }

  return masterData;
}

export async function saveGoogleMasterData(
  masterData: MasterData
) {
  const rows = Object.entries(masterData).flatMap(
    ([section, values]) =>
      values.map((value) => ({
        id: crypto.randomUUID(),
        section,
        value,
        status: "active"
      }))
  );

  const deleteResult = await supabase
    .from("master_data")
    .delete()
    .not("section", "is", null);

  if (deleteResult.error) {
    throw new GoogleApiError(
      deleteResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  if (rows.length) {
    const insertResult = await supabase
      .from("master_data")
      .insert(rows);

    if (insertResult.error) {
      throw new GoogleApiError(
        insertResult.error.message,
        "SUPABASE_ERROR"
      );
    }
  }

  invalidateGoogleApiCache();

  return masterData;
}

export async function fetchGoogleUsers() {
  const data =
    await postToGoogle<{
      users: ManagedUser[];
    }>({
      action: "getUsers"
    });

  return data.users || [];
}

export async function saveGoogleUsers(
  users: ManagedUser[]
) {
  const data =
    await postToGoogle<{
      users: ManagedUser[];
    }>({
      action: "saveUsers",
      users
    });

  return data.users || [];
}

export async function saveGeneratedReportPdf(
  payload: {
    fileName: string;
    base64Pdf: string;
    recordIds: string[];
  }
) {
  return postToGoogle<{
    reportUrl: string;
    reportFileId: string;
  }>({
    action:
      "saveGeneratedReportPdf",
    ...payload
  });
}

export async function deleteGoogleRecord(
  recordId: string
) {
  const entriesResult = await supabase
    .from("flight_entries")
    .delete()
    .eq("record_id", recordId);

  if (entriesResult.error) {
    throw new GoogleApiError(
      entriesResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  const indexResult = await supabase
    .from("flight_record_index")
    .delete()
    .eq("record_id", recordId);

  if (indexResult.error) {
    throw new GoogleApiError(
      indexResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  const logResult = await supabase
    .from("flight_logs")
    .delete()
    .eq("id", recordId);

  if (logResult.error) {
    throw new GoogleApiError(
      logResult.error.message,
      "SUPABASE_ERROR"
    );
  }

  invalidateGoogleApiCache();

  return { recordId };
}


export type FlightRecordValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export async function validateGoogleFlightRecord(
  record: FlightLogRecord
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateKeys = new Set<string>();

  if (!record.student.studentName.trim()) {
    errors.push("Student name is required.");
  }

  if (!record.student.company.trim()) {
    errors.push("Company is required.");
  }

  if (!record.student.lastFourCharacters.trim()) {
    errors.push("Last 4 characters are required.");
  }

  if (!record.student.studentSignatureDataUrl) {
    errors.push("Student signature is required.");
  }

  if (!record.rows.length) {
    errors.push("At least one flight entry is required.");
  }

  for (const row of record.rows) {
    const duration = Number(row.duration);
    const duplicateKey = [
      row.date,
      row.location,
      row.startTime,
      row.uaModel,
      row.batterySn
    ].join("|").toLowerCase();

    if (!row.date) errors.push("Date is required.");
    if (!row.location.trim()) errors.push("Location is required.");
    if (!row.startTime.trim()) errors.push("Start time is required.");
    if (flightEntryStartMinutes(row.startTime) === null) {
      errors.push("Start time must use HH:MM in 24-hour format.");
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      errors.push("Duration must be a positive whole number.");
    }
    if (!row.uaModel.trim()) errors.push("UA Model is required.");
    if (!row.uaCategory.trim()) errors.push("UA Category is required.");
    if (!row.batterySn.trim()) errors.push("Battery S/N is required.");
    if (!row.pilotInCommand.trim()) {
      errors.push("Pilot in Command is required.");
    }
    if (!row.instructorInCommand.trim()) {
      errors.push("AFE / Instructor is required.");
    }

    if (duplicateKeys.has(duplicateKey)) {
      errors.push("Duplicate flight entries are not allowed.");
    }
    duplicateKeys.add(duplicateKey);
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings))
  };
}

export async function checkGoogleStudentLastFour(
  payload: {
    lastFourCharacters: string;
    recordId?: string;
  }
) {
  const lastFourCharacters =
    payload.lastFourCharacters.trim();

  if (!lastFourCharacters) {
    return {
      available: false,
      message: "Enter the last 4 characters."
    };
  }

  let query = supabase
    .from("flight_logs")
    .select("id, student_name")
    .eq("last_four_characters", lastFourCharacters)
    .limit(1);

  if (payload.recordId) {
    query = query.neq("id", payload.recordId);
  }

  const { data, error } = await query;

  if (error) {
    throw new GoogleApiError(
      error.message,
      "SUPABASE_ERROR"
    );
  }

  const conflictingRecord = data?.[0];

  if (conflictingRecord) {
    return {
      available: false,
      message: `Last 4 characters already belong to ${conflictingRecord.student_name || "another student"}.`,
      conflictingRecordId: conflictingRecord.id,
      conflictingStudentName:
        conflictingRecord.student_name || undefined
    };
  }

  return {
    available: true,
    message: "Last 4 characters are available."
  };
}

export async function fetchUnavailableBatteriesForDate(
  payload: {
    date: string;
    recordId?: string;
  }
) {
  let query = supabase
    .from("flight_entries")
    .select("battery_sn")
    .eq("date", payload.date);

  if (payload.recordId) {
    query = query.neq("record_id", payload.recordId);
  }

  const { data, error } = await query;

  if (error) {
    throw new GoogleApiError(
      error.message,
      "SUPABASE_ERROR"
    );
  }

  return {
    date: payload.date,
    unavailableBatteries: Array.from(
      new Set(
        (data || [])
          .map((row) => row.battery_sn)
          .filter(Boolean)
      )
    )
  };
}
