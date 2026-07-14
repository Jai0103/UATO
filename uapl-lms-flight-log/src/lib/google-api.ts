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

  return data as T;
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

// Add this exported function near the bottom of src/lib/google-api.ts.
export async function deleteGoogleRecord(recordId: string) {
  const data = await postToGoogle<{
    recordId: string;
    message?: string;
  }>({
    action: "deleteRecord",
    recordId,
  });

  return data;
}


// Add this exported type and function to src/lib/google-api.ts.
export type FlightRecordValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export async function validateGoogleFlightRecord(record: FlightLogRecord) {
  const data = await postToGoogle<{
    validation: FlightRecordValidation;
  }>({
    action: "validateFlightRecord",
    record,
  });

  return data.validation;
}
