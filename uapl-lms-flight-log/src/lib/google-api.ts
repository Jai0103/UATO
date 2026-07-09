import type { FlightLogRecord } from "@/lib/flight-log-storage";
import type { MasterData } from "@/lib/master-data";
import type { ManagedUser } from "@/lib/user-storage";

export const googleAppsScriptUrl =
  "https://script.google.com/macros/s/AKfycbwjmTFIGbGSHhaxj9ds86l5_Vgx6vuovgQZpfNRSexZH5T336eLEylJiWoKaPkAkHnZPg/exec";

type ApiResponse<T> =
  | {
      ok: true;
    } & T
  | {
      ok: false;
      error: string;
    };

async function postToGoogle<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(googleAppsScriptUrl, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as ApiResponse<T>;

  if (!data.ok) {
    throw new Error(data.error || "Google API request failed");
  }

  return data as T;
}

export async function fetchGoogleRecords() {
  const data = await postToGoogle<{ records: FlightLogRecord[] }>({
    action: "getRecords"
  });

  return data.records;
}

export async function saveGoogleRecord(record: FlightLogRecord) {
  const data = await postToGoogle<{ record: FlightLogRecord }>({
    action: "saveRecord",
    record
  });

  return data.record;
}

export async function fetchGoogleMasterData() {
  const data = await postToGoogle<{ masterData: MasterData }>({
    action: "getMasterData"
  });

  return data.masterData;
}

export async function saveGoogleMasterData(masterData: MasterData) {
  const data = await postToGoogle<{ masterData: MasterData }>({
    action: "saveMasterData",
    masterData
  });

  return data.masterData;
}


export async function fetchGoogleUsers() {
  const data = await postToGoogle<{ users: ManagedUser[] }>({
    action: "getUsers"
  });

  return data.users;
}

export async function saveGoogleUsers(users: ManagedUser[]) {
  const data = await postToGoogle<{ users: ManagedUser[] }>({
    action: "saveUsers",
    users
  });

  return data.users;
}
