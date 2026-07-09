export type StudentDetails = {
  studentName: string;
  company: string;
  lastFourCharacters: string;
  studentSignatureDataUrl: string;
};

export type FlightLogRow = {
  date: string;
  location: string;
  startTime: string;
  duration: string;
  uaModel: string;
  uaCategory: string;
  batterySn: string;
  pilotInCommand: string;
  instructorInCommand: string;
  remarks: string;
};

export type FlightLogRecord = {
  id: string;
  student: StudentDetails;
  rows: FlightLogRow[];
  createdAt: string;
  updatedAt: string;
};

export const flightLogRecordsKey = "uapl_flight_log_records";
export const flightLogDraftKey = "uapl_flight_log_draft";

export const emptyStudent: StudentDetails = {
  studentName: "",
  company: "",
  lastFourCharacters: "",
  studentSignatureDataUrl: ""
};

export const emptyRow: FlightLogRow = {
  date: "",
  location: "",
  startTime: "",
  duration: "",
  uaModel: "",
  uaCategory: "M7",
  batterySn: "",
  pilotInCommand: "",
  instructorInCommand: "",
  remarks: ""
};

export function getFlightLogRecords(): FlightLogRecord[] {
  if (typeof window === "undefined") return [];

  const rawRecords = localStorage.getItem(flightLogRecordsKey);
  if (!rawRecords) return [];

  try {
    return JSON.parse(rawRecords) as FlightLogRecord[];
  } catch {
    localStorage.removeItem(flightLogRecordsKey);
    return [];
  }
}

export function createFlightLogRecord(
  student: StudentDetails,
  rows: FlightLogRow[],
  existing?: {
    id?: string;
    createdAt?: string;
  }
): FlightLogRecord {
  const now = new Date().toISOString();

  return {
    id: existing?.id || crypto.randomUUID(),
    student,
    rows,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

export function saveFlightLogRecord(
  student: StudentDetails,
  rows: FlightLogRow[]
): FlightLogRecord {
  const currentRecords = getFlightLogRecords();
  const now = new Date().toISOString();

  const existingRecordIndex = currentRecords.findIndex(
    (record) =>
      record.student.studentName.trim().toLowerCase() ===
        student.studentName.trim().toLowerCase() &&
      record.student.lastFourCharacters.trim().toLowerCase() ===
        student.lastFourCharacters.trim().toLowerCase()
  );

  if (existingRecordIndex >= 0) {
    const updatedRecord: FlightLogRecord = {
      ...currentRecords[existingRecordIndex],
      student,
      rows,
      updatedAt: now
    };

    const updatedRecords = [...currentRecords];
    updatedRecords[existingRecordIndex] = updatedRecord;
    localStorage.setItem(flightLogRecordsKey, JSON.stringify(updatedRecords));

    return updatedRecord;
  }

  const newRecord: FlightLogRecord = {
    id: crypto.randomUUID(),
    student,
    rows,
    createdAt: now,
    updatedAt: now
  };

  localStorage.setItem(
    flightLogRecordsKey,
    JSON.stringify([newRecord, ...currentRecords])
  );

  return newRecord;
}
