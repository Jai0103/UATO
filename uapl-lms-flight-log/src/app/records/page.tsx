const SPREADSHEET_ID =
  "1bi8dq-NXiCOKuzWpn_269IiMPyT-1pDyRNRbclgQgEA";

const SIGNATURE_FOLDER_NAME =
  "UAPL LMS Student Signatures";

const REPORT_FOLDER_NAME =
  "UAPL LMS Generated Reports";

const UAPL_LMS_SIGN_IN_URL =
  "https://jai0103.github.io/UATO/";

const SHEETS = {
  flightLogs: "FlightLogs",
  masterData: "MasterData",
  users: "Users"
};

const MASTER_DATA_SECTIONS = [
  "locations",
  "batterySerialNumbers",
  "afeInstructors",
  "uaModels",
  "uaCategories"
];

const DEFAULT_MASTER_DATA = {
  locations: ["Kranji", "Old Holland"],
  batterySerialNumbers: [],
  afeInstructors: [],
  uaModels: [],
  uaCategories: ["M7", "M25", "H"]
};

function doGet() {
  return jsonResponse({
    ok: true,
    success: true,
    message: "UAPL LMS secure API is running."
  });
}

function doPost(e) {
  const requestStartedAt = Date.now();
  let requestAction = "unknown";
  let requestSucceeded = true;
  let requestError = "";

  try {
    const contents =
      e && e.postData
        ? e.postData.contents
        : "{}";

    const payload =
      JSON.parse(contents || "{}");

    const action =
      String(payload.action || "")
        .trim();

    requestAction = action || "missing-action";

    if (!action) {
      return jsonResponse({
        ok: false,
        success: false,
        code: "MISSING_ACTION",
        message: "Missing action."
      });
    }

    /*
     * Public authentication actions
     */

    if (action === "secureLogin") {
      return jsonResponse(
        secureLogin(payload)
      );
    }

    if (
      action === "verifySession" ||
      action ===
        "verifySecureSession"
    ) {
      return jsonResponse(
        verifySecureSession(payload)
      );
    }

    if (
      action === "secureLogout" ||
      action === "logout"
    ) {
      return jsonResponse(
        secureLogout(payload)
      );
    }

    if (
      action ===
      "secureChangePassword"
    ) {
      const session = requireSession(payload, [
        "admin",
        "trainer"
      ]);

      const passwordChangeResult =
        secureChangePassword(payload);

      if (
        passwordChangeResult &&
        passwordChangeResult.ok !== false &&
        passwordChangeResult.success !== false
      ) {
        appendAuditEvent(session, {
          action: "PASSWORD_CHANGED",
          entityType: "user",
          entityId: session.user.id,
          entityName: session.user.name,
          previousValue: null,
          updatedValue: {
            passwordChangedAt:
              new Date().toISOString()
          },
          details: {
            method: "authenticated-user"
          }
        });
      }

      return jsonResponse(
        passwordChangeResult
      );
    }

    if (
      action === "forgotPassword"
    ) {
      return forgotPassword(payload);
    }

    /*
     * Trainer and admin actions
     */

    if (action === "getRecordsPage") {
      requireSession(payload, ["admin", "trainer"]);
      return jsonResponse({
        ok: true,
        success: true,
        ...getRecordsPage(payload)
      });
    }

    if (action === "getRecordById") {
      requireSession(payload, ["admin", "trainer"]);
      return jsonResponse({
        ok: true,
        success: true,
        record: getRecordById(payload.recordId)
      });
    }

    if (action === "getRecordsByIds") {
      requireSession(payload, ["admin", "trainer"]);
      return jsonResponse({
        ok: true,
        success: true,
        records: getRecordsByIds(payload.recordIds)
      });
    }

    if (action === "validateFlightRecord") {
      requireSession(payload, ["admin", "trainer"]);

      const record = payload.record || payload.data || payload;

      return jsonResponse({
        ok: true,
        success: true,
        validation: validateFlightRecordData(record)
      });
    }

    if (action === "checkStudentLastFour") {
      requireSession(payload, ["admin", "trainer"]);

      return jsonResponse({
        ok: true,
        success: true,
        ...checkStudentLastFourUnique(payload)
      });
    }

    if (action === "getUnavailableBatteriesForDate") {
      requireSession(payload, ["admin", "trainer"]);

      return jsonResponse({
        ok: true,
        success: true,
        ...getUnavailableBatteriesForDate(payload)
      });
    }

    if (
      action === "getMasterData"
    ) {
      requireSession(payload, [
        "admin",
        "trainer"
      ]);

      return jsonResponse({
        ok: true,
        success: true,
        masterData:
          getMasterData()
      });
    }

    if (
      action === "saveRecord" ||
      action === "saveFlightLog" ||
      action ===
        "saveFlightLogRecord" ||
      action === "saveGoogleRecord"
    ) {
      const session =
        requireSession(payload, [
          "admin",
          "trainer"
        ]);

      const record =
        payload.record ||
        payload.data ||
        payload;

      const previousRecord =
        record && record.id
          ? getRecordAuditSnapshot(record.id)
          : null;

      const validation = validateFlightRecordData(record);

      if (validation.errors.length) {
        throw new Error(validation.errors.join(" "));
      }

      const savedRecord =
        saveRecord(record);

      appendAuditEvent(session, {
        action: previousRecord
          ? "FLIGHT_UPDATED"
          : "FLIGHT_CREATED",
        entityType: "flightLog",
        entityId: savedRecord.id,
        entityName:
          savedRecord.student.studentName,
        previousValue: previousRecord,
        updatedValue: createFlightAuditSnapshot(savedRecord),
        details: {
          company:
            savedRecord.student.company,
          flightCount:
            Array.isArray(savedRecord.rows)
              ? savedRecord.rows.length
              : 0
        }
      });

      return jsonResponse({
        ok: true,
        success: true,
        message:
          "Flight log saved.",
        savedBy: {
          name:
            session.user.name,
          email:
            session.user.email,
          role:
            session.user.role
        },
        record: savedRecord,
        warnings: validation.warnings
      });
    }

    if (
      action ===
      "saveGeneratedReportPdf"
    ) {
      const session = requireSession(payload, [
        "admin",
        "trainer"
      ]);

      return saveGeneratedReportPdf(
        payload,
        session
      );
    }

    if (
      action === "deleteRecord" ||
      action === "deleteFlightLog" ||
      action === "deleteGoogleRecord"
    ) {
      const session = requireSession(payload, [
        "admin",
        "trainer"
      ]);

      const deletedRecord = deleteFlightRecord(
        payload.recordId || payload.id
      );

      appendAuditEvent(session, {
        action: "FLIGHT_DELETED",
        entityType: "flightLog",
        entityId: deletedRecord.id,
        entityName:
          deletedRecord.student.studentName,
        previousValue: deletedRecord,
        updatedValue: null,
        details: {
          company:
            deletedRecord.student.company,
          flightCount:
            Array.isArray(deletedRecord.rows)
              ? deletedRecord.rows.length
              : 0,
          permanentlyDeleted: true
        }
      });

      return jsonResponse({
        ok: true,
        success: true,
        message: "Flight record deleted.",
        recordId: deletedRecord.id
      });
    }

    /*
     * Admin-only actions
     */

    if (action === "getAuditHistoryPage") {
      return jsonResponse({
        ok: true,
        success: true,
        ...getAuditHistoryPage(payload)
      });
    }

    if (action === "getAuditHistoryDetail") {
      return jsonResponse({
        ok: true,
        success: true,
        record: getAuditHistoryDetail(payload)
      });
    }

    if (action === "setupPerformancePhase2") {
      requireSession(payload, ["admin"]);
      return jsonResponse(setupPerformancePhase2());
    }

    if (
      action ===
      "getMasterDataCatalog"
    ) {
      requireSession(payload, [
        "admin"
      ]);

      return jsonResponse({
        ok: true,
        success: true,
        catalog:
          getMasterDataCatalog()
      });
    }

    if (action === "getDashboardStats") {
      requireSession(payload, ["admin"]);
      return jsonResponse({
        ok: true,
        success: true,
        dashboard: getDashboardStats()
      });
    }

    if (
      action === "saveMasterData" ||
      action ===
        "saveGoogleMasterData"
    ) {
      const session = requireSession(payload, [
        "admin"
      ]);

      const previousCatalog =
        getMasterDataCatalog();

      const masterData =
        payload.masterData ||
        payload.data ||
        payload;

      saveMasterData(masterData);

      const updatedCatalog =
        getMasterDataCatalog();

      appendMasterDataAuditEvents(
        session,
        previousCatalog,
        updatedCatalog
      );

      return jsonResponse({
        ok: true,
        success: true,
        message:
          "Master data saved.",
        masterData:
          getMasterData()
      });
    }

    if (
      action ===
      "saveMasterDataCatalog"
    ) {
      const session = requireSession(payload, [
        "admin"
      ]);

      const previousCatalog =
        getMasterDataCatalog();

      const catalog =
        payload.catalog ||
        payload.data;

      saveMasterDataCatalog(
        catalog
      );

      const updatedCatalog =
        getMasterDataCatalog();

      appendMasterDataAuditEvents(
        session,
        previousCatalog,
        updatedCatalog
      );

      return jsonResponse({
        ok: true,
        success: true,
        message:
          "Master data catalog saved.",
        catalog:
          getMasterDataCatalog(),
        masterData:
          getMasterData()
      });
    }

    if (action === "setUserAccountStatusWithAudit") {
      return jsonResponse(
        setUserAccountStatusWithAudit(payload)
      );
    }

    if (action === "setUserAccountStatus") {
      return jsonResponse(
        setUserAccountStatus(payload)
      );
    }

    if (action === "getUsers") {
      requireSession(payload, [
        "admin"
      ]);

      return jsonResponse({
        ok: true,
        success: true,
        users: getUsers()
      });
    }

    if (
      action === "saveUsers" ||
      action === "saveGoogleUsers"
    ) {
      const session = requireSession(payload, [
        "admin"
      ]);

      const previousUsers = getUsers();

      saveUsers(
        payload.users ||
        payload.data ||
        []
      );

      const updatedUsers = getUsers();
      appendUserAuditEvents(
        session,
        previousUsers,
        updatedUsers
      );

      return jsonResponse({
        ok: true,
        success: true,
        message: "Users saved.",
        users: getUsers()
      });
    }

    requestSucceeded = false;
    requestError = "Unknown action: " + action;

    return jsonResponse({
      ok: false,
      success: false,
      code: "UNKNOWN_ACTION",
      message:
        "Unknown action: " + action
    });
  } catch (error) {
    const rawMessage =
      error && error.message
        ? String(error.message)
        : String(
            error ||
              "Apps Script request failed."
          );

    requestSucceeded = false;
    requestError = rawMessage;

    let code = "SERVER_ERROR";
    let message = rawMessage;

    if (
      rawMessage.indexOf(
        "AUTH_REQUIRED:"
      ) === 0
    ) {
      code = "AUTH_REQUIRED";

      message = rawMessage
        .replace(
          "AUTH_REQUIRED:",
          ""
        )
        .trim();
    } else if (
      rawMessage.indexOf(
        "FORBIDDEN:"
      ) === 0
    ) {
      code = "FORBIDDEN";

      message = rawMessage
        .replace(
          "FORBIDDEN:",
          ""
        )
        .trim();
    } else if (
      rawMessage.indexOf(
        "TOO_MANY_ATTEMPTS:"
      ) === 0
    ) {
      code =
        "TOO_MANY_ATTEMPTS";

      message = rawMessage
        .replace(
          "TOO_MANY_ATTEMPTS:",
          ""
        )
        .trim();
    } else if (
      rawMessage.indexOf(
        "PASSWORD_WEAK:"
      ) === 0
    ) {
      code = "PASSWORD_WEAK";

      message = rawMessage
        .replace(
          "PASSWORD_WEAK:",
          ""
        )
        .trim();
    } else if (
      rawMessage.indexOf(
        "RECORD_CONFLICT:"
      ) === 0
    ) {
      code = "RECORD_CONFLICT";

      message = rawMessage
        .replace(
          "RECORD_CONFLICT:",
          ""
        )
        .trim();
    }

    return jsonResponse({
      ok: false,
      success: false,
      code,
      message
    });
  } finally {
    logRequestTiming(
      requestAction,
      requestStartedAt,
      requestSucceeded,
      requestError
    );
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

let UAPL_SPREADSHEET_INSTANCE = null;
const UAPL_SHEET_INSTANCES = {};

function getSpreadsheet() {
  if (!UAPL_SPREADSHEET_INSTANCE) {
    UAPL_SPREADSHEET_INSTANCE =
      SpreadsheetApp.openById(
        SPREADSHEET_ID
      );
  }

  return UAPL_SPREADSHEET_INSTANCE;
}

function getSheet(name) {
  if (UAPL_SHEET_INSTANCES[name]) {
    return UAPL_SHEET_INSTANCES[name];
  }

  const sheet =
    getSpreadsheet().getSheetByName(name);

  if (!sheet) {
    throw new Error(
      "Missing sheet: " + name
    );
  }

  UAPL_SHEET_INSTANCES[name] = sheet;
  return UAPL_SHEET_INSTANCES[name];
}

function saveRecord(record) {
  if (!record || !record.student) {
    throw new Error(
      "Missing record payload."
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet(SHEETS.flightLogs);
    const values = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    const id = record.id || Utilities.getUuid();
    const existingRowIndex = values.findIndex((row, index) => {
      if (index === 0) return false;
      return String(row[0]) === String(id);
    });

    if (existingRowIndex >= 0) {
      const expectedUpdatedAt = String(record.updatedAt || "").trim();
      const currentUpdatedAt = performanceDateText(
        values[existingRowIndex][7]
      );

      const expectedTimestamp = new Date(expectedUpdatedAt).getTime();
      const currentTimestamp = new Date(currentUpdatedAt).getTime();
      const versionsMatch =
        Number.isFinite(expectedTimestamp) &&
        Number.isFinite(currentTimestamp)
          ? expectedTimestamp === currentTimestamp
          : expectedUpdatedAt === currentUpdatedAt;

      if (!expectedUpdatedAt || !versionsMatch) {
        throw new Error(
          "RECORD_CONFLICT:This student record was updated by another trainer. Load the latest record and merge your unsaved flights before saving again."
        );
      }
    }

    const existingSignatureFileId =
      existingRowIndex >= 0
        ? values[existingRowIndex][4] || ""
        : "";
    const newSignatureFileId = saveSignatureImage(
      record.student.studentName,
      record.student.studentSignatureDataUrl
    );
    const signatureFileId =
      newSignatureFileId || existingSignatureFileId;
    const rowData = [
      id,
      record.student.studentName || "",
      record.student.company || "",
      record.student.lastFourCharacters || "",
      signatureFileId,
      JSON.stringify(record.rows || []),
      record.createdAt || now,
      now
    ];
    const previousRows =
      existingRowIndex >= 0
        ? parseFlightRows(values[existingRowIndex][5])
        : [];

    if (existingRowIndex >= 0) {
      sheet
        .getRange(
          existingRowIndex + 1,
          1,
          1,
          rowData.length
        )
        .setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    const savedRecord = {
      id: rowData[0],
      student: {
        studentName: rowData[1],
        company: rowData[2],
        lastFourCharacters: rowData[3],
        studentSignatureDataUrl:
          record.student.studentSignatureDataUrl || ""
      },
      rows: record.rows || [],
      createdAt: rowData[6],
      updatedAt: rowData[7]
    };

    syncPerformanceRecord(savedRecord, signatureFileId);
    invalidateFlightPerformanceCache(
      flightDatesFromRows(previousRows)
        .concat(flightDatesFromRows(record.rows))
    );
    SpreadsheetApp.flush();

    return savedRecord;
  } finally {
    lock.releaseLock();
  }
}

function normalizeFlightText(value) {
  return String(value || "").trim().toLowerCase();
}

function checkStudentLastFourUnique(payload) {
  return checkFastStudentLastFourUnique(payload);

  const lastFour = normalizeFlightText(payload.lastFourCharacters);
  const recordId = String(payload.recordId || "").trim();

  if (!lastFour) {
    return {
      available: false,
      message: "Enter the last 4 characters before continuing."
    };
  }

  const sheet = getSheet(SHEETS.flightLogs);
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const matches = sheet
      .getRange(2, 4, lastRow - 1, 1)
      .createTextFinder(String(payload.lastFourCharacters || "").trim())
      .matchEntireCell(true)
      .matchCase(false)
      .findAll();

    for (let index = 0; index < matches.length; index++) {
      const rowNumber = matches[index].getRow();
      const row = sheet.getRange(rowNumber, 1, 1, 4).getValues()[0];
      const existingId = String(row[0] || "");

      if (!existingId || existingId === recordId) continue;

      return {
        available: false,
        conflictingRecordId: existingId,
        conflictingStudentName: String(row[1] || ""),
        message:
          "The last 4 characters are already assigned to " +
          String(row[1] || "another student") + "."
      };
    }
  }

  return {
    available: true,
    message: "The last 4 characters are available."
  };
}

function getUnavailableBatteriesForDate(payload) {
  return getFastUnavailableBatteriesForDate(payload);

  const date = normalizeFlightDate(payload.date);
  const recordId = String(payload.recordId || "").trim();

  if (!date) {
    return {
      date: "",
      unavailableBatteries: []
    };
  }

  const cacheKey = batteryAvailabilityCacheKey(date);
  let cachedEntries = readPerformanceJson(cacheKey);

  if (!Array.isArray(cachedEntries)) {
    const sheet = getSheet(SHEETS.flightLogs);
    const lastRow = sheet.getLastRow();
    const values =
      lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, 6).getValues()
        : [];

    cachedEntries = [];

    values.forEach(sheetRow => {
      const existingId = String(sheetRow[0] || "");
      if (!existingId) return;

      parseFlightRows(sheetRow[5]).forEach(flightRow => {
        if (normalizeFlightDate(flightRow.date) !== date) return;

        const battery = String(flightRow.batterySn || "").trim();
        if (battery) {
          cachedEntries.push({
            recordId: existingId,
            battery
          });
        }
      });
    });

    writePerformanceJson(
      cacheKey,
      cachedEntries,
      PERFORMANCE_CACHE_SECONDS.batteryAvailability
    );
  }

  const unavailable = {};

  cachedEntries.forEach(entry => {
    const existingId = String(entry.recordId || "");
    if (!existingId || existingId === recordId) return;

    const battery = String(entry.battery || "").trim();
    if (battery) unavailable[normalizeFlightText(battery)] = battery;
  });

  return {
    date,
    unavailableBatteries: Object.keys(unavailable)
      .map(key => unavailable[key])
      .sort()
  };
}

function normalizeFlightDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) return match[1] + "-" + match[2] + "-" + match[3];

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return "";

  const year = match[3].length === 2 ? "20" + match[3] : match[3];
  return year + "-" + match[2].padStart(2, "0") + "-" +
    match[1].padStart(2, "0");
}

function flightStartMinutes(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function flightDuplicateKey(row) {
  return [
    normalizeFlightDate(row.date),
    normalizeFlightText(row.location),
    String(row.startTime || "").trim(),
    normalizeFlightText(row.uaModel),
    normalizeFlightText(row.batterySn)
  ].join("|");
}

function intervalsOverlap(firstStart, firstDuration, secondStart, secondDuration) {
  return firstStart < secondStart + secondDuration &&
    secondStart < firstStart + firstDuration;
}

function validateFlightRecordData(record) {
  return validateFlightRecordDataV2(record);

  const errors = [];
  const warnings = [];
  const student = record && record.student ? record.student : {};
  const rows = record && Array.isArray(record.rows) ? record.rows : [];
  const recordId = String(record && record.id || "");
  const lastFour = normalizeFlightText(student.lastFourCharacters);
  const sheet = getSheet(SHEETS.flightLogs);
  const values = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );

  if (!String(student.studentName || "").trim()) {
    errors.push("Student name is required.");
  }
  if (!String(student.company || "").trim()) {
    errors.push("Company or organisation is required.");
  }
  if (!lastFour) {
    errors.push("The last 4 characters are required.");
  }

  let existingSignatureFileId = "";

  values.slice(1).forEach(sheetRow => {
    const otherId = String(sheetRow[0] || "");
    if (!otherId) return;

    if (otherId === recordId) {
      existingSignatureFileId = String(sheetRow[4] || "");
      return;
    }

    if (
      lastFour &&
      normalizeFlightText(sheetRow[3]) === lastFour
    ) {
      errors.push(
        "The last 4 characters are already assigned to " +
          String(sheetRow[1] || "another student") + "."
      );
    }
  });

  const hasSubmittedSignature = Boolean(
    student.studentSignatureDataUrl &&
    String(student.studentSignatureDataUrl).indexOf("data:image/") === 0
  );

  if (!hasSubmittedSignature && !existingSignatureFileId) {
    errors.push("Student signature is required before final save.");
  }

  if (!rows.length) errors.push("At least one flight entry is required.");

  const activeMasterData = getMasterData();
  const activeModels = (activeMasterData.uaModels || []).map(normalizeFlightText);
  const activeBatteries =
    (activeMasterData.batterySerialNumbers || []).map(normalizeFlightText);
  const seenFlightKeys = {};
  const validatedRows = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const date = normalizeFlightDate(row.date);
    const start = flightStartMinutes(row.startTime);
    const duration = Number(row.duration);
    const model = normalizeFlightText(row.uaModel);
    const battery = normalizeFlightText(row.batterySn);

    if (!date) errors.push("Flight " + rowNumber + " has an invalid date.");
    else if (date > today) errors.push("Flight " + rowNumber + " cannot use a future date.");

    if (start === null) {
      errors.push("Flight " + rowNumber + " must use start time HH:MM.");
    }

    if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) {
      errors.push(
        "Flight " + rowNumber + " duration must be a whole number from 1 to 1440 minutes."
      );
    }

    if (!String(row.location || "").trim()) {
      errors.push("Flight " + rowNumber + " requires a location.");
    }
    if (!String(row.uaCategory || "").trim()) {
      errors.push("Flight " + rowNumber + " requires a UA category.");
    }
    if (!String(row.pilotInCommand || "").trim()) {
      errors.push("Flight " + rowNumber + " requires a Pilot in Command.");
    }
    if (!String(row.instructorInCommand || "").trim()) {
      errors.push("Flight " + rowNumber + " requires an AFE or Instructor.");
    }

    if (!model || activeModels.indexOf(model) === -1) {
      errors.push("Flight " + rowNumber + " must use an active UA model.");
    }
    if (!battery || activeBatteries.indexOf(battery) === -1) {
      errors.push("Flight " + rowNumber + " must use an active battery.");
    }

    const duplicateKey = flightDuplicateKey(row);
    if (seenFlightKeys[duplicateKey]) {
      errors.push("Flight " + rowNumber + " duplicates another entry in this record.");
    } else {
      seenFlightKeys[duplicateKey] = true;
    }

    validatedRows.push({
      row,
      rowNumber,
      date,
      start,
      duration,
      battery,
      duplicateKey
    });
  });

  for (let firstIndex = 0; firstIndex < validatedRows.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < validatedRows.length; secondIndex++) {
      const first = validatedRows[firstIndex];
      const second = validatedRows[secondIndex];

      if (
        first.date &&
        first.date === second.date &&
        first.battery &&
        first.battery === second.battery
      ) {
        errors.push(
          "Battery " + String(first.row.batterySn || "") +
            " is already used on " + first.date +
            " in flight " + first.rowNumber + "."
        );
      }
    }
  }

  values.slice(1).forEach(sheetRow => {
    const otherId = String(sheetRow[0] || "");
    if (!otherId || otherId === recordId) return;

    const otherStudent = String(sheetRow[1] || "another student");
    const otherRows = parseFlightRows(sheetRow[5]);

    otherRows.forEach(otherRow => {
      const otherDate = normalizeFlightDate(otherRow.date);
      const otherStart = flightStartMinutes(otherRow.startTime);
      const otherDuration = Number(otherRow.duration);
      const otherBattery = normalizeFlightText(otherRow.batterySn);
      const otherKey = flightDuplicateKey(otherRow);

      validatedRows.forEach(current => {
        if (current.duplicateKey === otherKey) {
          errors.push(
            "Flight " + current.rowNumber +
              " duplicates a saved entry for " + otherStudent + "."
          );
        }

        if (
          current.date &&
          current.date === otherDate &&
          current.battery &&
          current.battery === otherBattery
        ) {
          errors.push(
            "Battery " + String(current.row.batterySn || "") +
              " is already used on " + current.date +
              " by a saved flight for " + otherStudent + "."
          );
        }
      });
    });
  });

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings))
  };
}

function createFlightAuditSnapshot(record) {
  if (!record) return null;

  return {
    id: String(record.id || ""),
    student: {
      studentName: String(
        record.student &&
        record.student.studentName || ""
      ),
      company: String(
        record.student &&
        record.student.company || ""
      ),
      lastFourCharacters: String(
        record.student &&
        record.student.lastFourCharacters || ""
      )
    },
    rows: Array.isArray(record.rows)
      ? record.rows
      : [],
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || "")
  };
}

function getRecordAuditSnapshot(recordId) {
  try {
    return createFlightAuditSnapshot(getFastRecordById(recordId));
  } catch (error) {
    return null;
  }

  const cleanId = String(recordId || "").trim();
  if (!cleanId) return null;

  const sheet = getSheet(SHEETS.flightLogs);
  const values = sheet.getDataRange().getValues();

  for (let index = 1; index < values.length; index++) {
    const row = values[index];

    if (String(row[0] || "") !== cleanId) continue;

    return createFlightAuditSnapshot({
      id: row[0],
      student: {
        studentName: row[1],
        company: row[2],
        lastFourCharacters: row[3]
      },
      rows: parseFlightRows(row[5]),
      createdAt: row[6],
      updatedAt: row[7]
    });
  }

  return null;
}

function deleteFlightRecord(recordId) {
  const cleanId = String(recordId || "").trim();

  if (!cleanId) {
    throw new Error("Missing record ID.");
  }

  const sheet = getSheet(SHEETS.flightLogs);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let deletedRecord = null;
  let signatureFileId = "";

  try {
    const values = sheet.getDataRange().getValues();

    for (let index = 1; index < values.length; index++) {
      const row = values[index];

      if (String(row[0] || "") !== cleanId) continue;

      deletedRecord = createFlightAuditSnapshot({
        id: row[0],
        student: {
          studentName: row[1],
          company: row[2],
          lastFourCharacters: row[3]
        },
        rows: parseFlightRows(row[5]),
        createdAt: row[6],
        updatedAt: row[7]
      });

      signatureFileId = String(row[4] || "");
      sheet.deleteRow(index + 1);
      SpreadsheetApp.flush();
      break;
    }
  } finally {
    lock.releaseLock();
  }

  if (!deletedRecord) {
    throw new Error("Flight record was not found.");
  }

  invalidateFlightPerformanceCache(
    flightDatesFromRows(deletedRecord.rows)
  );
  deletePerformanceRecord(cleanId);

  if (signatureFileId) {
    try {
      DriveApp.getFileById(signatureFileId).setTrashed(true);
    } catch (error) {
      console.warn(
        "Unable to move the deleted signature file to trash: " +
          String(error && error.message || error)
      );
    }
  }

  return deletedRecord;
}

function createEmptyCatalog() {
  const sections = {};

  MASTER_DATA_SECTIONS.forEach(section => {
    sections[section] = [];
  });

  return {
    sections
  };
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "inactive"
    ? "inactive"
    : "active";
}

function normalizeCatalog(catalog) {
  const normalized =
    createEmptyCatalog();

  const sourceSections =
    catalog &&
    catalog.sections
      ? catalog.sections
      : catalog || {};

  MASTER_DATA_SECTIONS.forEach(section => {
    const items =
      Array.isArray(sourceSections[section])
        ? sourceSections[section]
        : [];

    const seen = {};

    items.forEach(item => {
      const itemValue =
        typeof item === "string"
          ? item.trim()
          : String(
              item && item.value
                ? item.value
                : ""
            ).trim();

      if (!itemValue) return;

      const duplicateKey =
        itemValue.toLowerCase();

      if (seen[duplicateKey]) {
        throw new Error(
          'Duplicate value "' +
            itemValue +
            '" in ' +
            section +
            "."
        );
      }

      seen[duplicateKey] = true;

      normalized.sections[section].push({
        id:
          typeof item === "object" &&
          item &&
          item.id
            ? String(item.id)
            : Utilities.getUuid(),
        value: itemValue,
        status:
          typeof item === "object" &&
          item
            ? normalizeStatus(item.status)
            : "active"
      });
    });

    normalized.sections[section].sort(
      (a, b) =>
        a.value.localeCompare(b.value)
    );
  });

  return normalized;
}

function getMasterDataCatalog() {
  const cachedCatalog = readPerformanceJson(
    PERFORMANCE_CACHE_KEYS.masterDataCatalog
  );

  if (cachedCatalog && cachedCatalog.sections) {
    return cachedCatalog;
  }

  const sheet =
    getSheet(SHEETS.masterData);

  const values =
    sheet.getDataRange().getValues();

  if (values.length <= 1) {
    seedDefaultMasterData();
    return getMasterDataCatalog();
  }

  const catalog =
    createEmptyCatalog();

  values.slice(1).forEach(row => {
    const section =
      String(row[0] || "").trim();

    const value =
      String(row[1] || "").trim();

    const status =
      normalizeStatus(row[2]);

    const id =
      String(row[3] || "").trim() ||
      Utilities.getUuid();

    if (
      !MASTER_DATA_SECTIONS.includes(
        section
      ) ||
      !value
    ) {
      return;
    }

    const existingIndex =
      catalog.sections[section]
        .findIndex(
          item =>
            item.value
              .trim()
              .toLowerCase() ===
            value.toLowerCase()
        );

    if (existingIndex >= 0) {
      catalog.sections[section][
        existingIndex
      ] = {
        id,
        value,
        status
      };

      return;
    }

    catalog.sections[section].push({
      id,
      value,
      status
    });
  });

  MASTER_DATA_SECTIONS.forEach(section => {
    catalog.sections[section].sort(
      (a, b) =>
        a.value.localeCompare(b.value)
    );
  });

  writePerformanceJson(
    PERFORMANCE_CACHE_KEYS.masterDataCatalog,
    catalog,
    PERFORMANCE_CACHE_SECONDS.masterData
  );

  return catalog;
}

function getMasterData() {
  const catalog =
    getMasterDataCatalog();

  const masterData = {};

  MASTER_DATA_SECTIONS.forEach(section => {
    masterData[section] =
      catalog.sections[section]
        .filter(
          item =>
            item.status === "active"
        )
        .map(item => item.value)
        .sort();
  });

  return masterData;
}

function saveMasterData(masterData) {
  const catalog =
    createEmptyCatalog();

  MASTER_DATA_SECTIONS.forEach(section => {
    const values =
      masterData &&
      Array.isArray(masterData[section])
        ? masterData[section]
        : [];

    catalog.sections[section] =
      values
        .map(value =>
          String(value || "").trim()
        )
        .filter(Boolean)
        .map(value => ({
          id: Utilities.getUuid(),
          value,
          status: "active"
        }));
  });

  saveMasterDataCatalog(catalog);
}

function saveMasterDataCatalog(catalog) {
  const normalized =
    normalizeCatalog(catalog);

  const sheet =
    getSheet(SHEETS.masterData);

  const rows = [
    [
      "section",
      "value",
      "status",
      "id"
    ]
  ];

  MASTER_DATA_SECTIONS.forEach(section => {
    normalized.sections[section]
      .forEach(item => {
        rows.push([
          section,
          item.value,
          item.status,
          item.id
        ]);
      });
  });

  sheet.clearContents();

  sheet
    .getRange(
      1,
      1,
      rows.length,
      rows[0].length
    )
    .setValues(rows);

  sheet.setFrozenRows(1);
  invalidateMasterDataPerformanceCache();
}

function flattenMasterDataCatalog(catalog) {
  const entries = [];
  const normalized = normalizeCatalog(catalog);

  MASTER_DATA_SECTIONS.forEach(section => {
    normalized.sections[section].forEach(item => {
      entries.push({
        section,
        id: String(item.id || ""),
        value: String(item.value || ""),
        status: normalizeStatus(item.status)
      });
    });
  });

  return entries;
}

function masterDataValueKey(item) {
  return [
    String(item.section || "").toLowerCase(),
    String(item.value || "").trim().toLowerCase()
  ].join("|");
}

function appendMasterDataAuditEvents(session, previousCatalog, updatedCatalog) {
  const previousItems = flattenMasterDataCatalog(previousCatalog);
  const updatedItems = flattenMasterDataCatalog(updatedCatalog);
  const previousById = {};
  const previousByValue = {};
  const usedPreviousIds = {};

  previousItems.forEach(item => {
    if (item.id) previousById[item.id] = item;

    const valueKey = masterDataValueKey(item);
    if (!previousByValue[valueKey]) previousByValue[valueKey] = [];
    previousByValue[valueKey].push(item);
  });

  updatedItems.forEach(updatedItem => {
    let previousItem =
      updatedItem.id && previousById[updatedItem.id]
        ? previousById[updatedItem.id]
        : null;

    if (!previousItem) {
      const possibleMatches =
        previousByValue[masterDataValueKey(updatedItem)] || [];

      previousItem = possibleMatches.find(item => {
        return !usedPreviousIds[item.id || masterDataValueKey(item)];
      }) || null;
    }

    if (!previousItem) {
      appendAuditEvent(session, {
        action: "MASTER_DATA_CREATED",
        entityType: "masterData",
        entityId: updatedItem.id,
        entityName: updatedItem.value,
        previousValue: null,
        updatedValue: updatedItem,
        details: { section: updatedItem.section }
      });
      return;
    }

    usedPreviousIds[
      previousItem.id || masterDataValueKey(previousItem)
    ] = true;

    const valueChanged =
      previousItem.value !== updatedItem.value ||
      previousItem.section !== updatedItem.section;

    const statusChanged =
      previousItem.status !== updatedItem.status;

    if (!valueChanged && !statusChanged) return;

    let action = "MASTER_DATA_UPDATED";

    if (!valueChanged && statusChanged) {
      action = updatedItem.status === "active"
        ? "MASTER_DATA_ACTIVATED"
        : "MASTER_DATA_DEACTIVATED";
    }

    appendAuditEvent(session, {
      action,
      entityType: "masterData",
      entityId: updatedItem.id,
      entityName: updatedItem.value,
      previousValue: previousItem,
      updatedValue: updatedItem,
      details: { section: updatedItem.section }
    });
  });

  previousItems.forEach(previousItem => {
    const matchKey = previousItem.id || masterDataValueKey(previousItem);
    if (usedPreviousIds[matchKey]) return;

    const stillExists = updatedItems.some(updatedItem => {
      return (
        previousItem.id && updatedItem.id === previousItem.id
      ) || masterDataValueKey(updatedItem) === masterDataValueKey(previousItem);
    });

    if (stillExists) return;

    appendAuditEvent(session, {
      action: "MASTER_DATA_DELETED",
      entityType: "masterData",
      entityId: previousItem.id,
      entityName: previousItem.value,
      previousValue: previousItem,
      updatedValue: null,
      details: { section: previousItem.section }
    });
  });
}

function seedDefaultMasterData() {
  const catalog =
    createEmptyCatalog();

  MASTER_DATA_SECTIONS.forEach(section => {
    catalog.sections[section] =
      (DEFAULT_MASTER_DATA[section] || [])
        .map(value => ({
          id: Utilities.getUuid(),
          value,
          status: "active"
        }));
  });

  saveMasterDataCatalog(catalog);
}

function getUsers() {
  const sheet =
    getSheet(SHEETS.users);

  ensureUserSecurityColumns();

  const values =
    sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];

  const columns = {
    id:
      headers.indexOf("id"),

    name:
      headers.indexOf("name"),

    email:
      headers.indexOf("email"),

    role:
      headers.indexOf("role"),

    createdAt:
      headers.indexOf(
        "createdAt"
      ),

    passwordChangedAt:
      headers.indexOf(
        "passwordChangedAt"
      ),

    accountStatus:
      headers.indexOf(
        "accountStatus"
      ),

    passwordUpdatedAt:
      headers.indexOf(
        "passwordUpdatedAt"
      )
  };

  return values
    .slice(1)
    .filter(row => {
      return (
        columns.id !== -1 &&
        row[columns.id]
      );
    })
    .map(row => ({
      id: String(
        row[columns.id] || ""
      ),

      name: String(
        row[columns.name] || ""
      ),

      email: String(
        row[columns.email] || ""
      ),

      role:
        String(
          row[columns.role] ||
            "trainer"
        ) === "admin"
          ? "admin"
          : "trainer",

      /*
       * Never return a password,
       * hash, salt, or session token.
       */
      temporaryPassword: "",

      createdAt:
        columns.createdAt === -1
          ? ""
          : String(
              row[
                columns.createdAt
              ] || ""
            ),

      passwordChangedAt:
        columns.passwordChangedAt ===
        -1
          ? ""
          : String(
              row[
                columns
                  .passwordChangedAt
              ] || ""
            ),

      accountStatus:
        columns.accountStatus === -1
          ? "active"
          : String(
              row[
                columns.accountStatus
              ] || "active"
            ),

      passwordUpdatedAt:
        columns.passwordUpdatedAt ===
        -1
          ? ""
          : String(
              row[
                columns
                  .passwordUpdatedAt
              ] || ""
            )
    }));
}

function saveUsers(users) {
  const sheet =
    getSheet(SHEETS.users);

  ensureAuthPepper();
  ensureUserSecurityColumns();

  const currentValues =
    sheet.getDataRange().getValues();

  const currentHeaders =
    currentValues.length
      ? currentValues[0]
      : [];

  const currentUsersById = {};

  if (currentValues.length > 1) {
    const idColumn =
      currentHeaders.indexOf("id");

    currentValues.slice(1).forEach(row => {
      const id = String(row[idColumn] || "");
      if (!id) return;

      const existing = {};
      currentHeaders.forEach((header, index) => {
        existing[header] = row[index];
      });
      currentUsersById[id] = existing;
    });
  }

  const headers = [
    "id",
    "name",
    "email",
    "role",
    "temporaryPassword",
    "createdAt",
    "passwordChangedAt",
    "accountStatus",
    "passwordHash",
    "passwordSalt",
    "passwordIterations",
    "passwordUpdatedAt"
  ];

  const rows = [headers];
  const normalizedUsers = [];

  (users || []).forEach(user => {
    const id = String(user.id || Utilities.getUuid());
    const existing = currentUsersById[id] || {};
    const submittedPassword = String(user.temporaryPassword || "");

    let passwordHash = String(existing.passwordHash || "");
    let passwordSalt = String(existing.passwordSalt || "");
    let passwordIterations =
      Number(existing.passwordIterations) || AUTH_CONFIG.passwordIterations;
    let passwordUpdatedAt = String(existing.passwordUpdatedAt || "");

    if (submittedPassword) {
      const alreadyMatches =
        passwordHash &&
        passwordSalt &&
        verifyPassword(
          submittedPassword,
          passwordHash,
          passwordSalt,
          passwordIterations
        );

      if (!alreadyMatches) {
        const passwordData = createPasswordHash(submittedPassword);
        passwordHash = passwordData.hash;
        passwordSalt = passwordData.salt;
        passwordIterations = passwordData.iterations;
        passwordUpdatedAt = new Date().toISOString();
      }
    }

    if (!passwordHash) {
      throw new Error(
        "A temporary password is required for " +
          String(user.email || user.name || "the new user") +
          "."
      );
    }

    const accountStatus =
      String(user.accountStatus || existing.accountStatus || "active")
        .trim()
        .toLowerCase() === "inactive"
        ? "inactive"
        : "active";

    const normalizedUser = {
      id,
      name: String(user.name || ""),
      email: String(user.email || "").trim().toLowerCase(),
      role: user.role === "admin" ? "admin" : "trainer",
      temporaryPassword: "",
      createdAt:
        user.createdAt || existing.createdAt || new Date().toISOString(),
      passwordChangedAt:
        user.passwordChangedAt !== undefined
          ? user.passwordChangedAt
          : existing.passwordChangedAt || "",
      accountStatus,
      passwordHash,
      passwordSalt,
      passwordIterations,
      passwordUpdatedAt
    };

    normalizedUsers.push(normalizedUser);
    rows.push(headers.map(header => normalizedUser[header] || ""));
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
    sheet.setFrozenRows(1);
    revokeUnavailableUserSessions(normalizedUsers);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateDashboardPerformanceCache();
}

function createUserAuditSnapshot(user) {
  if (!user) return null;

  return {
    id: String(user.id || ""),
    name: String(user.name || ""),
    email: String(user.email || ""),
    role: String(user.role || "trainer"),
    accountStatus:
      String(user.accountStatus || "active") === "inactive"
        ? "inactive"
        : "active",
    createdAt: String(user.createdAt || "")
  };
}

function userAuditSnapshotsMatch(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function appendUserAuditEvents(session, previousUsers, updatedUsers) {
  const previousById = {};
  const updatedById = {};

  (previousUsers || []).forEach(user => {
    previousById[String(user.id || "")] =
      createUserAuditSnapshot(user);
  });

  (updatedUsers || []).forEach(user => {
    updatedById[String(user.id || "")] =
      createUserAuditSnapshot(user);
  });

  Object.keys(updatedById).forEach(userId => {
    const previousUser = previousById[userId] || null;
    const updatedUser = updatedById[userId];

    if (!previousUser) {
      appendAuditEvent(session, {
        action: "USER_CREATED",
        entityType: "user",
        entityId: userId,
        entityName: updatedUser.name,
        previousValue: null,
        updatedValue: updatedUser
      });
      return;
    }

    if (!userAuditSnapshotsMatch(previousUser, updatedUser)) {
      appendAuditEvent(session, {
        action: "USER_UPDATED",
        entityType: "user",
        entityId: userId,
        entityName: updatedUser.name,
        previousValue: previousUser,
        updatedValue: updatedUser
      });
    }
  });

  Object.keys(previousById).forEach(userId => {
    if (updatedById[userId]) return;

    const previousUser = previousById[userId];

    appendAuditEvent(session, {
      action: "USER_DELETED",
      entityType: "user",
      entityId: userId,
      entityName: previousUser.name,
      previousValue: previousUser,
      updatedValue: null
    });
  });
}

function parseFlightRows(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function recordFromSheetRow(row, includeDetails) {
  const signatureFileId = String(row[4] || "");
  const flightRows = parseFlightRows(row[5]);

  return {
    id: String(row[0] || ""),
    student: {
      studentName: String(row[1] || ""),
      company: String(row[2] || ""),
      lastFourCharacters: String(row[3] || ""),
      studentSignatureDataUrl:
        includeDetails && signatureFileId
          ? getSignatureDataUrl(signatureFileId)
          : ""
    },
    rows: includeDetails ? flightRows : [],
    flightCount: flightRows.length,
    createdAt: String(row[6] || ""),
    updatedAt: String(row[7] || "")
  };
}

function normalizePageNumber(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getRecordTimestamp(record) {
  const value = record.updatedAt || record.createdAt || "";
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function recordMatchesDate(record, month, year) {
  if (!month && !year) return true;

  const value = record.updatedAt || record.createdAt || "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (year && String(date.getFullYear()) !== String(year)) return false;
  if (month && String(date.getMonth() + 1).padStart(2, "0") !== String(month).padStart(2, "0")) {
    return false;
  }

  return true;
}

function getRecordsPage(payload) {
  return getFastRecordsPage(payload);

  const sheet = getSheet(SHEETS.flightLogs);
  const values = sheet.getDataRange().getValues();
  const requestedPage = normalizePageNumber(payload.page, 1);
  const requestedSize = normalizePageNumber(payload.pageSize, 10);
  const pageSize = Math.min(25, Math.max(10, requestedSize));
  const query = String(payload.query || "").trim().toLowerCase();
  const month = String(payload.month || "").trim();
  const year = String(payload.year || "").trim();

  const matchingRecords = values
    .slice(1)
    .filter(row => row[0])
    .map(row => recordFromSheetRow(row, false))
    .filter(record => {
      const searchable = [
        record.student.studentName,
        record.student.company,
        record.student.lastFourCharacters
      ].join(" ").toLowerCase();

      return (!query || searchable.indexOf(query) !== -1) &&
        recordMatchesDate(record, month, year);
    })
    .sort((first, second) => getRecordTimestamp(second) - getRecordTimestamp(first));

  const totalRecords = matchingRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    records: matchingRecords.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    totalRecords,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  };
}

function getRecordById(recordId) {
  return getFastRecordById(recordId);

  const cleanId = String(recordId || "").trim();
  if (!cleanId) throw new Error("Missing record ID.");

  const sheet = getSheet(SHEETS.flightLogs);
  const values = sheet.getDataRange().getValues();

  for (let index = 1; index < values.length; index++) {
    if (String(values[index][0] || "") === cleanId) {
      return recordFromSheetRow(values[index], true);
    }
  }

  throw new Error("Flight record was not found.");
}

function getRecordsByIds(recordIds) {
  return getFastRecordsByIds(recordIds);

  const requestedIds = Array.isArray(recordIds)
    ? recordIds.map(String).filter(Boolean).slice(0, 25)
    : [];

  if (!requestedIds.length) return [];

  const requestedLookup = {};
  requestedIds.forEach(id => { requestedLookup[id] = true; });

  const sheet = getSheet(SHEETS.flightLogs);
  const values = sheet.getDataRange().getValues();
  const recordsById = {};

  for (let index = 1; index < values.length; index++) {
    const id = String(values[index][0] || "");
    if (requestedLookup[id]) {
      recordsById[id] = recordFromSheetRow(values[index], true);
    }
  }

  return requestedIds
    .map(id => recordsById[id])
    .filter(Boolean);
}

function getDashboardStats() {
  return getFastDashboardStats();

  const recordSheet = getSheet(SHEETS.flightLogs);
  const recordValues = recordSheet.getDataRange().getValues();
  const uniqueStudents = {};
  const recentRecords = [];
  const monthlyCounts = {};
  let pendingRecords = 0;
  let completedRecords = 0;
  let totalFlights = 0;
  let totalMinutes = 0;

  recordValues.slice(1).forEach(row => {
    if (!row[0]) return;

    const studentName = String(row[1] || "");
    const company = String(row[2] || "");
    const lastFour = String(row[3] || "");
    const hasSignature = Boolean(row[4]);
    const flightRows = parseFlightRows(row[5]);
    const createdAt = String(row[6] || "");
    const updatedAt = String(row[7] || "");
    const studentKey = (studentName + "|" + lastFour).trim().toLowerCase();

    if (studentKey) uniqueStudents[studentKey] = true;
    totalFlights += flightRows.length;

    flightRows.forEach(flight => {
      const duration = Number(flight && flight.duration);
      if (Number.isFinite(duration) && duration > 0) totalMinutes += duration;
    });

    if (hasSignature && flightRows.length > 0) completedRecords++;
    else pendingRecords++;

    const recordDate = new Date(updatedAt || createdAt);
    if (!Number.isNaN(recordDate.getTime())) {
      const monthKey =
        recordDate.getFullYear() + "-" +
        String(recordDate.getMonth() + 1).padStart(2, "0");
      monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
    }

    recentRecords.push({
      id: String(row[0]),
      studentName,
      company,
      flightCount: flightRows.length,
      updatedAt,
      createdAt,
      timestamp: getRecordTimestamp({ updatedAt, createdAt })
    });
  });

  let activeTrainers = 0;
  const userSheet = getSheet(SHEETS.users);
  const userValues = userSheet.getDataRange().getValues();

  if (userValues.length > 1) {
    const headers = userValues[0];
    const roleColumn = headers.indexOf("role");
    const statusColumn = headers.indexOf("accountStatus");

    userValues.slice(1).forEach(row => {
      const role = roleColumn === -1 ? "" : String(row[roleColumn] || "");
      const status = statusColumn === -1
        ? "active"
        : String(row[statusColumn] || "active").trim().toLowerCase();
      if (role === "trainer" && status === "active") activeTrainers++;
    });
  }

  const monthlyActivity = [];
  const now = new Date();

  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key =
      date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0");

    monthlyActivity.push({
      key,
      label: Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        "MMM yyyy"
      ),
      count: monthlyCounts[key] || 0
    });
  }

  return {
    totalStudents: Object.keys(uniqueStudents).length,
    totalRecords: Math.max(0, recordValues.length - 1),
    pendingRecords,
    completedRecords,
    activeTrainers,
    totalFlights,
    totalMinutes,
    recentRecords: recentRecords
      .sort((first, second) => second.timestamp - first.timestamp)
      .slice(0, 5)
      .map(record => ({
        id: record.id,
        studentName: record.studentName,
        company: record.company,
        flightCount: record.flightCount,
        updatedAt: record.updatedAt,
        createdAt: record.createdAt
      })),
    monthlyActivity
  };
}

function revokeUnavailableUserSessions(users) {
  const activeUserIds = {};

  (users || []).forEach(user => {
    if (String(user.accountStatus || "active") === "active") {
      activeUserIds[String(user.id)] = true;
    }
  });

  const sessionSheet = ensureSessionsSheet();
  const values = sessionSheet.getDataRange().getValues();

  for (let index = values.length - 1; index >= 1; index--) {
    const userId = String(values[index][1] || "");
    if (!activeUserIds[userId]) {
      sessionSheet.deleteRow(index + 1);
    }
  }
}

function setUserAccountStatus(payload) {
  const adminSession = requireSession(payload, ["admin"]);
  const userId = String(payload.userId || "").trim();
  const requestedStatus = String(payload.status || "").trim().toLowerCase();

  if (!userId) throw new Error("Missing user ID.");
  if (requestedStatus !== "active" && requestedStatus !== "inactive") {
    throw new Error("Invalid account status.");
  }

  const sheet = getSheet(SHEETS.users);
  ensureUserSecurityColumns();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idColumn = headers.indexOf("id");
  const nameColumn = headers.indexOf("name");
  const emailColumn = headers.indexOf("email");
  const roleColumn = headers.indexOf("role");
  const statusColumn = headers.indexOf("accountStatus");

  if (idColumn === -1 || emailColumn === -1 || statusColumn === -1) {
    throw new Error("Users sheet is missing required columns.");
  }

  let targetRow = -1;
  let targetName = "";
  let targetEmail = "";
  let targetRole = "trainer";
  let previousStatus = "active";

  for (let index = 1; index < values.length; index++) {
    if (String(values[index][idColumn] || "") === userId) {
      targetRow = index + 1;
      targetName = String(values[index][nameColumn] || "");
      targetEmail = String(values[index][emailColumn] || "");
      targetRole = String(values[index][roleColumn] || "trainer");
      previousStatus = String(values[index][statusColumn] || "active")
        .trim()
        .toLowerCase() === "inactive"
        ? "inactive"
        : "active";
      break;
    }
  }

  if (targetRow === -1) throw new Error("User account was not found.");

  if (
    requestedStatus === "inactive" &&
    targetEmail.trim().toLowerCase() ===
      adminSession.user.email.trim().toLowerCase()
  ) {
    throw new Error("You cannot deactivate your own account.");
  }

  if (targetRole === "admin" && requestedStatus === "inactive") {
    let activeAdmins = 0;
    for (let index = 1; index < values.length; index++) {
      const role = String(values[index][roleColumn] || "");
      const status = String(values[index][statusColumn] || "active")
        .trim()
        .toLowerCase();
      if (role === "admin" && status === "active") activeAdmins++;
    }
    if (activeAdmins <= 1) {
      throw new Error("The final active administrator cannot be deactivated.");
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    sheet.getRange(targetRow, statusColumn + 1).setValue(requestedStatus);
    if (requestedStatus === "inactive") removeUserSessions(userId);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const auditEntry = appendAuditEvent(adminSession, {
    action:
      requestedStatus === "active"
        ? "USER_ACTIVATED"
        : "USER_DEACTIVATED",
    entityType: "user",
    entityId: userId,
    entityName: targetName,
    previousValue: {
      id: userId,
      name: targetName,
      email: targetEmail,
      role: targetRole,
      accountStatus: previousStatus
    },
    updatedValue: {
      id: userId,
      name: targetName,
      email: targetEmail,
      role: targetRole,
      accountStatus: requestedStatus
    },
    details: {
      statusChanged:
        previousStatus !== requestedStatus
    }
  });

  invalidateDashboardPerformanceCache();

  return {
    ok: true,
    success: true,
    message: targetName + " is now " + requestedStatus + ".",
    userId,
    status: requestedStatus,
    auditRecorded: true,
    auditId: auditEntry.id,
    auditTimestamp: auditEntry.timestamp
  };
}

function setUserAccountStatusWithAudit(payload) {
  const adminSession = requireSession(payload, ["admin"]);
  const userId = String(payload.userId || "").trim();
  const requestedStatus = String(payload.status || "").trim().toLowerCase();

  if (!userId) throw new Error("Missing user ID.");
  if (requestedStatus !== "active" && requestedStatus !== "inactive") {
    throw new Error("Invalid account status.");
  }

  const sheet = getSheet(SHEETS.users);
  ensureUserSecurityColumns();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idColumn = headers.indexOf("id");
  const nameColumn = headers.indexOf("name");
  const emailColumn = headers.indexOf("email");
  const roleColumn = headers.indexOf("role");
  const statusColumn = headers.indexOf("accountStatus");

  if (
    idColumn === -1 ||
    nameColumn === -1 ||
    emailColumn === -1 ||
    roleColumn === -1 ||
    statusColumn === -1
  ) {
    throw new Error("Users sheet is missing required columns.");
  }

  let targetRow = -1;
  let targetName = "";
  let targetEmail = "";
  let targetRole = "trainer";
  let previousStatus = "active";

  for (let index = 1; index < values.length; index++) {
    if (String(values[index][idColumn] || "") !== userId) continue;

    targetRow = index + 1;
    targetName = String(values[index][nameColumn] || "");
    targetEmail = String(values[index][emailColumn] || "");
    targetRole = String(values[index][roleColumn] || "trainer");
    previousStatus =
      String(values[index][statusColumn] || "active").trim().toLowerCase() ===
      "inactive"
        ? "inactive"
        : "active";
    break;
  }

  if (targetRow === -1) throw new Error("User account was not found.");

  if (
    requestedStatus === "inactive" &&
    targetEmail.trim().toLowerCase() ===
      adminSession.user.email.trim().toLowerCase()
  ) {
    throw new Error("You cannot deactivate your own account.");
  }

  if (targetRole === "admin" && requestedStatus === "inactive") {
    let activeAdmins = 0;

    for (let index = 1; index < values.length; index++) {
      const role = String(values[index][roleColumn] || "");
      const status = String(values[index][statusColumn] || "active")
        .trim()
        .toLowerCase();

      if (role === "admin" && status === "active") activeAdmins++;
    }

    if (activeAdmins <= 1) {
      throw new Error("The final active administrator cannot be deactivated.");
    }
  }

  const previousValue = {
    id: userId,
    name: targetName,
    email: targetEmail,
    role: targetRole,
    accountStatus: previousStatus
  };

  const updatedValue = {
    id: userId,
    name: targetName,
    email: targetEmail,
    role: targetRole,
    accountStatus: requestedStatus
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let auditEntry;

  try {
    sheet.getRange(targetRow, statusColumn + 1).setValue(requestedStatus);

    try {
      auditEntry = appendAuditEventUnlocked(adminSession, {
        action:
          requestedStatus === "active"
            ? "USER_ACTIVATED"
            : "USER_DEACTIVATED",
        entityType: "user",
        entityId: userId,
        entityName: targetName,
        previousValue,
        updatedValue,
        details: {
          statusChanged: previousStatus !== requestedStatus,
          endpoint: "setUserAccountStatusWithAudit"
        }
      });
    } catch (auditError) {
      sheet.getRange(targetRow, statusColumn + 1).setValue(previousStatus);
      SpreadsheetApp.flush();
      throw new Error(
        "Status was not changed because Audit History could not be updated: " +
          String(auditError && auditError.message || auditError)
      );
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  if (requestedStatus === "inactive") {
    removeUserSessions(userId);
  }

  invalidateDashboardPerformanceCache();

  return {
    ok: true,
    success: true,
    message: targetName + " is now " + requestedStatus + ".",
    userId,
    status: requestedStatus,
    auditRecorded: true,
    auditId: auditEntry.id,
    auditTimestamp: auditEntry.timestamp
  };
}

function generateTemporaryPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  let password = "UAPL-";

  for (let i = 0; i < 8; i++) {
    password += chars.charAt(
      Math.floor(
        Math.random() * chars.length
      )
    );
  }

  return password;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function forgotPassword(payload) {
  ensureAuthPepper();
  ensureUserSecurityColumns();

  const identifier =
    String(
      payload.identifier || ""
    )
      .trim()
      .toLowerCase();

  if (!identifier) {
    return jsonResponse({
      ok: false,
      success: false,
      code: "INVALID_INPUT",
      message:
        "Please enter your email or username."
    });
  }

  const sheet =
    getSheet(SHEETS.users);

  const values =
    sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return jsonResponse({
      ok: false,
      success: false,
      code: "ACCOUNT_NOT_FOUND",
      message:
        "No account was found for that email or username."
    });
  }

  const headers = values[0];

  const columns = {
    id:
      headers.indexOf("id"),

    name:
      headers.indexOf("name"),

    email:
      headers.indexOf("email"),

    role:
      headers.indexOf("role"),

    temporaryPassword:
      headers.indexOf(
        "temporaryPassword"
      ),

    passwordChangedAt:
      headers.indexOf(
        "passwordChangedAt"
      ),

    accountStatus:
      headers.indexOf(
        "accountStatus"
      ),

    passwordHash:
      headers.indexOf(
        "passwordHash"
      ),

    passwordSalt:
      headers.indexOf(
        "passwordSalt"
      ),

    passwordIterations:
      headers.indexOf(
        "passwordIterations"
      ),

    passwordUpdatedAt:
      headers.indexOf(
        "passwordUpdatedAt"
      )
  };

  if (
    columns.name === -1 ||
    columns.email === -1 ||
    columns.passwordHash === -1 ||
    columns.passwordSalt === -1 ||
    columns.passwordIterations === -1
  ) {
    return jsonResponse({
      ok: false,
      success: false,
      code:
        "SECURITY_NOT_CONFIGURED",
      message:
        "The Users sheet is missing security columns. Run setupSecurity first."
    });
  }

  let foundRow = -1;
  let userName = "";
  let userEmail = "";
  let userId = "";
  let userRole = "trainer";

  for (
    let index = 1;
    index < values.length;
    index++
  ) {
    const rowName =
      String(
        values[index][
          columns.name
        ] || ""
      )
        .trim()
        .toLowerCase();

    const rowEmail =
      String(
        values[index][
          columns.email
        ] || ""
      )
        .trim()
        .toLowerCase();

    if (
      rowName === identifier ||
      rowEmail === identifier
    ) {
      const status =
        columns.accountStatus === -1
          ? "active"
          : String(
              values[index][
                columns.accountStatus
              ] || "active"
            )
              .trim()
              .toLowerCase();

      if (status === "inactive") {
        return jsonResponse({
          ok: false,
          success: false,
          code:
            "ACCOUNT_INACTIVE",
          message:
            "This account is inactive. Contact your administrator."
        });
      }

      foundRow = index + 1;

      userName =
        String(
          values[index][
            columns.name
          ] || ""
        ).trim();

      userEmail =
        String(
          values[index][
            columns.email
          ] || ""
        ).trim();

      userId =
        columns.id === -1
          ? ""
          : String(
              values[index][columns.id] || ""
            ).trim();

      userRole =
        columns.role === -1
          ? "trainer"
          : String(
              values[index][columns.role] || "trainer"
            ).trim();

      break;
    }
  }

  if (
    foundRow === -1 ||
    !userEmail
  ) {
    return jsonResponse({
      ok: false,
      success: false,
      code: "ACCOUNT_NOT_FOUND",
      message:
        "No account was found for that email or username."
    });
  }

  const newPassword =
    generateTemporaryPassword();

  const passwordData =
    createPasswordHash(
      newPassword
    );

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    if (
      columns.temporaryPassword !==
      -1
    ) {
      // Temporarily retained until the
      // frontend migration is completed.
      sheet
        .getRange(
          foundRow,
          columns.temporaryPassword + 1
        )
        .setValue("");
    }

    sheet
      .getRange(
        foundRow,
        columns.passwordHash + 1
      )
      .setValue(
        passwordData.hash
      );

    sheet
      .getRange(
        foundRow,
        columns.passwordSalt + 1
      )
      .setValue(
        passwordData.salt
      );

    sheet
      .getRange(
        foundRow,
        columns.passwordIterations +
          1
      )
      .setValue(
        passwordData.iterations
      );

    if (
      columns.passwordUpdatedAt !==
      -1
    ) {
      sheet
        .getRange(
          foundRow,
          columns.passwordUpdatedAt +
            1
        )
        .setValue(
          new Date().toISOString()
        );
    }

    if (
      columns.passwordChangedAt !==
      -1
    ) {
      sheet
        .getRange(
          foundRow,
          columns.passwordChangedAt +
            1
        )
        .setValue("");
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  appendAuditEvent(null, {
    actorUserId: userId || "self-service",
    actorName: "Self-service password reset",
    actorEmail: userEmail,
    actorRole: "public",
    action: "PASSWORD_RESET",
    entityType: "user",
    entityId: userId,
    entityName: userName,
    previousValue: null,
    updatedValue: {
      passwordUpdatedAt: new Date().toISOString(),
      mustChangePassword: true
    },
    details: {
      deliveryMethod: "email"
    }
  });

  MailApp.sendEmail({
    to: userEmail,
    subject:
      "UAPL LMS Password Reset",
    body:
      "Hello " +
      userName +
      ",\n\n" +
      "Use this temporary password to sign in:\n" +
      newPassword +
      "\n\nSign in: " +
      UAPL_LMS_SIGN_IN_URL +
      "\n\nYou will be asked to create a new password after signing in.",
    htmlBody: `
      <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;">
        <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">
            UAPL LMS Password Reset
          </h2>

          <p style="color:#374151;font-size:15px;">
            Hello ${escapeHtml(userName)},
          </p>

          <p style="color:#374151;font-size:15px;">
            Use the temporary password below to sign in:
          </p>

          <div style="background:#111827;color:#ffffff;padding:16px 18px;border-radius:12px;font-size:22px;font-weight:700;letter-spacing:1px;text-align:center;margin:22px 0;">
            ${escapeHtml(newPassword)}
          </div>

          <p style="color:#374151;font-size:15px;">
            You will be asked to create a new password after signing in.
          </p>

          <div style="margin:26px 0;text-align:center;">
            <a
              href="${UAPL_LMS_SIGN_IN_URL}"
              target="_blank"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1;padding:15px 28px;border-radius:8px;"
            >
              Sign In to Flight Management System
            </a>
          </div>

          <p style="color:#6b7280;font-size:12px;line-height:18px;word-break:break-all;">
            If the button does not open, use this link:<br>
            <a
              href="${UAPL_LMS_SIGN_IN_URL}"
              style="color:#0369a1;text-decoration:underline;"
            >
              ${UAPL_LMS_SIGN_IN_URL}
            </a>
          </p>

          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            If you did not request this, contact your administrator immediately.
          </p>
        </div>
      </div>
    `
  });

  return jsonResponse({
    ok: true,
    success: true,
    message:
      "A temporary password has been sent to your email."
  });
}

function saveSignatureImage(
  studentName,
  dataUrl
) {
  if (
    !dataUrl ||
    !String(dataUrl).includes(",")
  ) {
    return "";
  }

  const folder =
    getOrCreateFolder(
      SIGNATURE_FOLDER_NAME
    );

  const base64 =
    String(dataUrl).split(",")[1];

  const bytes =
    Utilities.base64Decode(base64);

  const safeName =
    String(
      studentName || "Student"
    ).replace(
      /[\\/:*?"<>|]/g,
      ""
    );

  const blob =
    Utilities.newBlob(
      bytes,
      "image/png",
      safeName + " Signature.png"
    );

  const file =
    folder.createFile(blob);

  return file.getId();
}

function getSignatureDataUrl(fileId) {
  try {
    const file =
      DriveApp.getFileById(fileId);

    const blob = file.getBlob();

    const base64 =
      Utilities.base64Encode(
        blob.getBytes()
      );

    return (
      "data:" +
      blob.getContentType() +
      ";base64," +
      base64
    );
  } catch (error) {
    return "";
  }
}

function getOrCreateFolder(name) {
  const folders =
    DriveApp.getFoldersByName(name);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(name);
}

function saveGeneratedReportPdf(payload, session) {
  const fileName =
    String(
      payload.fileName ||
      "Flight Log Report.pdf"
    );

  const base64Pdf =
    String(
      payload.base64Pdf || ""
    );

  const recordIds =
    Array.isArray(payload.recordIds)
      ? payload.recordIds.map(String)
      : [];

  if (!base64Pdf) {
    return jsonResponse({
      ok: false,
      success: false,
      message: "Missing PDF file."
    });
  }

  const folder =
    getOrCreateFolder(
      REPORT_FOLDER_NAME
    );

  const bytes =
    Utilities.base64Decode(
      base64Pdf
    );

  const blob =
    Utilities.newBlob(
      bytes,
      "application/pdf",
      fileName
    );

  const file =
    folder.createFile(blob);

  file.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  const reportUrl =
    file.getUrl();

  const reportFileId =
    file.getId();

  const sheet =
    getSheet(SHEETS.flightLogs);

  let values =
    sheet.getDataRange().getValues();

  let headers = values[0];

  const requiredColumns = [
    "reportUrl",
    "reportFileId",
    "reportGeneratedAt"
  ];

  requiredColumns.forEach(column => {
    if (headers.indexOf(column) === -1) {
      sheet
        .getRange(
          1,
          sheet.getLastColumn() + 1
        )
        .setValue(column);

      headers =
        sheet
          .getDataRange()
          .getValues()[0];
    }
  });

  values =
    sheet.getDataRange().getValues();

  const reportUrlCol =
    headers.indexOf("reportUrl");

  const reportFileIdCol =
    headers.indexOf("reportFileId");

  const generatedAtCol =
    headers.indexOf(
      "reportGeneratedAt"
    );

  const now =
    new Date().toISOString();

  for (
    let index = 1;
    index < values.length;
    index++
  ) {
    const recordId =
      String(values[index][0] || "");

    if (
      recordIds.includes(recordId)
    ) {
      sheet
        .getRange(
          index + 1,
          reportUrlCol + 1
        )
        .setValue(reportUrl);

      sheet
        .getRange(
          index + 1,
          reportFileIdCol + 1
        )
        .setValue(reportFileId);

      sheet
        .getRange(
          index + 1,
          generatedAtCol + 1
        )
        .setValue(now);
    }
  }

  appendAuditEvent(session, {
    action: "REPORT_GENERATED",
    entityType: "report",
    entityId: reportFileId,
    entityName: fileName,
    previousValue: null,
    updatedValue: {
      fileName,
      reportUrl,
      reportFileId,
      generatedAt: now
    },
    details: {
      recordIds,
      recordCount: recordIds.length
    }
  });

  return jsonResponse({
    ok: true,
    success: true,
    reportUrl,
    reportFileId
  });
}

function testForgotPassword() {
  return forgotPassword({
    identifier:
      "orolazajairus@gmail.com"
  });
}
