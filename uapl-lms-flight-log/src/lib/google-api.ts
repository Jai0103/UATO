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

const API_CACHE_PREFIX = "uapl-api-cache-v3:";
const MAX_PERSISTED_CACHE_ENTRIES = 40;
const apiMemoryCache = new Map<string, ApiCacheEntry>();
const apiRequestsInFlight = new Map<string, Promise<unknown>>();

const API_READ_CACHE: Record<string, ApiCacheConfig> = {
  getAdminDashboardBundle: { ttlMs: 60_000, persist: true },
  getDashboardStats: { ttlMs: 60_000, persist: true },
  getApprovalDashboardSummary: { ttlMs: 60_000, persist: true },
  getFatigueRiskWeeklyStatus: { ttlMs: 60_000, persist: true },
  getMasterData: { ttlMs: 5 * 60_000, persist: true },
  getInventoryMasterData: { ttlMs: 5 * 60_000, persist: true },
  getInventoryDashboard: { ttlMs: 60_000, persist: true },
  getUaMaintenanceMasterData: { ttlMs: 5 * 60_000, persist: true },
  getStaffTrainingDescriptions: { ttlMs: 5 * 60_000, persist: true },
  getUsers: { ttlMs: 2 * 60_000, persist: false },
  getRecordsPage: { ttlMs: 45_000, persist: true },
  getRecordsByIds: { ttlMs: 30_000, persist: false },
  getStaffTrainingRecords: { ttlMs: 45_000, persist: false },
  getStaffTrainingRecordsPage: { ttlMs: 45_000, persist: true },
  getUaMaintenanceRecordsPage: { ttlMs: 45_000, persist: true },
  getFatigueRiskRecordsPage: { ttlMs: 45_000, persist: true },
  getInventoryAssetsPage: { ttlMs: 45_000, persist: true },
  getInventoryActivityPage: { ttlMs: 30_000, persist: true },
  getApprovalsPage: { ttlMs: 45_000, persist: true },
  getAuditHistoryPage: { ttlMs: 20_000, persist: false },
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
  return /^(save|delete|archive|create|update|setup|set|reset|rebuild)/i.test(
    action
  );
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

    try {
      response = await fetch(
        googleAppsScriptUrl,
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            sessionToken
          })
        }
      );
    } catch {
      throw new GoogleApiError(
        "Unable to connect to Google Sheets. Check your internet connection.",
        "NETWORK_ERROR"
      );
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

    if (cacheConfig) {
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
  const data =
    await postToGoogle<RecordsPageResponse>({
      action: "getRecordsPage",
      page: request.page || 1,
      pageSize:
        request.pageSize || 10,
      query:
        request.query?.trim() || "",
      month: request.month || "",
      year: request.year || ""
    });

  return {
    records: data.records || [],
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalRecords:
      data.totalRecords || 0,
    totalPages:
      Math.max(
        1,
        data.totalPages || 1
      ),
    hasPreviousPage:
      Boolean(
        data.hasPreviousPage
      ),
    hasNextPage:
      Boolean(data.hasNextPage)
  };
}

/*
 * Load one complete student record only
 * when the user opens or continues it.
 */
export async function fetchGoogleRecordById(
  recordId: string
) {
  const data =
    await postToGoogle<{
      record: FlightLogRecord;
    }>({
      action: "getRecordById",
      recordId
    });

  return data.record;
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

  const data =
    await postToGoogle<{
      records: FlightLogRecord[];
    }>({
      action: "getRecordsByIds",
      recordIds: uniqueIds
    });

  return data.records || [];
}

export async function saveGoogleRecord(
  record: FlightLogRecord
) {
  const data =
    await postToGoogle<{
      record: FlightLogRecord;
    }>({
      action: "saveRecord",
      record
    });

  return data.record;
}

export async function fetchGoogleMasterData() {
  const data =
    await postToGoogle<{
      masterData: MasterData;
    }>({
      action: "getMasterData"
    });

  return data.masterData;
}

export async function saveGoogleMasterData(
  masterData: MasterData
) {
  const data =
    await postToGoogle<{
      masterData: MasterData;
    }>({
      action: "saveMasterData",
      masterData
    });

  return data.masterData;
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
  const data = await postToGoogle<{
    recordId: string;
    message?: string;
  }>({
    action: "deleteRecord",
    recordId,
  });

  return data;
}


export type FlightRecordValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export async function validateGoogleFlightRecord(
  record: FlightLogRecord
) {
  const data =
    await postToGoogle<{
      validation: FlightRecordValidation;
    }>({
      action: "validateFlightRecord",
      record
    });

  return data.validation;
}

export async function checkGoogleStudentLastFour(
  payload: {
    lastFourCharacters: string;
    recordId?: string;
  }
) {
  return postToGoogle<{
    available: boolean;
    message: string;
    conflictingRecordId?: string;
    conflictingStudentName?: string;
  }>({
    action: "checkStudentLastFour",
    ...payload
  });
}

export async function fetchUnavailableBatteriesForDate(
  payload: {
    date: string;
    recordId?: string;
  }
) {
  return postToGoogle<{
    date: string;
    unavailableBatteries: string[];
  }>({
    action: "getUnavailableBatteriesForDate",
    ...payload
  });
}
