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
      !Number.isFinite(
        expiresAt
      ) ||
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

    handleAuthenticationError(
      code
    );

    throw new GoogleApiError(
      data.error ||
        data.message ||
        "Google API request failed.",
      code
    );
  }

  return data as T;
}

export async function fetchGoogleRecords() {
  const data =
    await postToGoogle<{
      records: FlightLogRecord[];
    }>({
      action: "getRecords"
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
