import { GoogleApiError } from "@/lib/google-api";
import { supabase } from "@/lib/supabase";
import type {
  StaffTrainingDescription,
  StaffTrainingItemStatus,
  StaffTrainingRecord,
  StaffTrainingRecordSummary
} from "@/lib/staff-training";

export type StaffTrainingRecordsPage = {
  records: StaffTrainingRecordSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type StaffTrainingRecordRow = {
  id: string;
  staff_name: string | null;
  staff_email: string | null;
  designation: string | null;
  head_of_training_name: string | null;
  signature_file_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type StaffTrainingEntryRow = {
  record_id: string;
  item_id: string;
  training_type: StaffTrainingDescription["trainingType"];
  description: string | null;
  sort_order: number | null;
  status: "" | "not_completed" | "in_progress" | "completed" | null;
  date_completed: string | null;
  remarks: string | null;
};

function mapDescription(row: {
  id: string;
  training_type: StaffTrainingDescription["trainingType"];
  description: string | null;
  sort_order: number | null;
  status: StaffTrainingDescription["status"] | null;
}): StaffTrainingDescription {
  return {
    id: row.id,
    trainingType: row.training_type,
    description: row.description || "",
    sortOrder: row.sort_order || 0,
    status: row.status || "active"
  };
}

function mapEntry(row: StaffTrainingEntryRow) {
  return {
    itemId: row.item_id,
    trainingType: row.training_type,
    description: row.description || "",
    sortOrder: row.sort_order || 0,
    status: (row.status || "") as StaffTrainingItemStatus,
    dateCompleted: row.date_completed || "",
    remarks: row.remarks || ""
  };
}

function mapRecord(
  row: StaffTrainingRecordRow,
  entries: StaffTrainingEntryRow[]
): StaffTrainingRecord {
  return {
    id: row.id,
    staffName: row.staff_name || "",
    staffEmail: row.staff_email || "",
    designation: row.designation || "",
    headOfTrainingName: row.head_of_training_name || "",
    signatureDataUrl: row.signature_file_id || "",
    items: entries
      .map(mapEntry)
      .sort((first, second) =>
        first.trainingType.localeCompare(second.trainingType) ||
        first.sortOrder - second.sortOrder
      ),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function summarizeRecord(
  row: StaffTrainingRecordRow,
  entries: StaffTrainingEntryRow[]
): StaffTrainingRecordSummary {
  const completedCount = entries.filter(
    (entry) => entry.status === "completed"
  ).length;

  return {
    id: row.id,
    staffName: row.staff_name || "",
    staffEmail: row.staff_email || "",
    designation: row.designation || "",
    headOfTrainingName: row.head_of_training_name || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    completedCount,
    totalCount: entries.length
  };
}

export async function fetchStaffTrainingDescriptions() {
  const { data, error } = await supabase
    .from("staff_training_descriptions")
    .select("id, training_type, description, sort_order, status")
    .order("training_type", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    throw new GoogleApiError(error.message, "SUPABASE_ERROR");
  }

  return (data || []).map(mapDescription);
}

export async function saveStaffTrainingDescriptions(
  descriptions: StaffTrainingDescription[]
) {
  const now = new Date().toISOString();
  const rows = descriptions.map((description) => ({
    id: description.id || crypto.randomUUID(),
    training_type: description.trainingType,
    description: description.description,
    sort_order: description.sortOrder,
    status: description.status,
    updated_at: now
  }));

  const { error } = await supabase
    .from("staff_training_descriptions")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new GoogleApiError(error.message, "SUPABASE_ERROR");
  }

  return descriptions;
}

export async function fetchStaffTrainingRecords() {
  const { data: records, error: recordsError } = await supabase
    .from("staff_training_records")
    .select("*")
    .order("updated_at", { ascending: false });

  if (recordsError) {
    throw new GoogleApiError(recordsError.message, "SUPABASE_ERROR");
  }

  const recordIds = (records || []).map((record) => record.id);

  const { data: entries, error: entriesError } = recordIds.length
    ? await supabase
        .from("staff_training_entries")
        .select("*")
        .in("record_id", recordIds)
    : { data: [], error: null };

  if (entriesError) {
    throw new GoogleApiError(entriesError.message, "SUPABASE_ERROR");
  }

  return (records || []).map((record) =>
    summarizeRecord(
      record,
      (entries || []).filter((entry) => entry.record_id === record.id)
    )
  );
}

export async function fetchStaffTrainingRecordsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
    year?: string;
  } = {}
) {
  const page = request.page || 1;
  const pageSize = request.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const query = request.query?.trim() || "";

  let builder = supabase
    .from("staff_training_records")
    .select("*", { count: "exact" });

  if (query) {
    builder = builder.or(
      `staff_name.ilike.%${query}%,staff_email.ilike.%${query}%,designation.ilike.%${query}%`
    );
  }

  if (request.year) {
    builder = builder
      .gte("created_at", `${request.year}-01-01`)
      .lt("created_at", `${Number(request.year) + 1}-01-01`);
  }

  const { data: records, error, count } = await builder
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new GoogleApiError(error.message, "SUPABASE_ERROR");
  }

  const recordIds = (records || []).map((record) => record.id);
  const { data: entries, error: entriesError } = recordIds.length
    ? await supabase
        .from("staff_training_entries")
        .select("*")
        .in("record_id", recordIds)
    : { data: [], error: null };

  if (entriesError) {
    throw new GoogleApiError(entriesError.message, "SUPABASE_ERROR");
  }

  const totalRecords = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return {
    records: (records || []).map((record) =>
      summarizeRecord(
        record,
        (entries || []).filter((entry) => entry.record_id === record.id)
      )
    ),
    page,
    pageSize,
    totalRecords,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  } satisfies StaffTrainingRecordsPage;
}

export async function fetchStaffTrainingRecord(recordId: string) {
  const { data: record, error } = await supabase
    .from("staff_training_records")
    .select("*")
    .eq("id", recordId)
    .single();

  if (error) {
    throw new GoogleApiError(error.message, "SUPABASE_ERROR");
  }

  const { data: entries, error: entriesError } = await supabase
    .from("staff_training_entries")
    .select("*")
    .eq("record_id", recordId);

  if (entriesError) {
    throw new GoogleApiError(entriesError.message, "SUPABASE_ERROR");
  }

  return mapRecord(record, entries || []);
}

export async function saveStaffTrainingRecord(
  record: StaffTrainingRecord
) {
  const now = new Date().toISOString();
  const createdAt = record.createdAt || now;
  const updatedAt = now;

  const recordRow = {
    id: record.id,
    staff_name: record.staffName,
    staff_email: record.staffEmail,
    designation: record.designation,
    head_of_training_name: record.headOfTrainingName,
    signature_file_id: record.signatureDataUrl,
    created_at: createdAt,
    updated_at: updatedAt
  };

  const entries = record.items.map((item) => ({
    record_id: record.id,
    item_id: item.itemId,
    training_type: item.trainingType,
    description: item.description,
    sort_order: item.sortOrder,
    status: item.status,
    date_completed: item.dateCompleted || null,
    remarks: item.remarks
  }));

  const { error } = await supabase
    .from("staff_training_records")
    .upsert(recordRow, { onConflict: "id" });

  if (error) {
    throw new GoogleApiError(error.message, "SUPABASE_ERROR");
  }

  const deleteResult = await supabase
    .from("staff_training_entries")
    .delete()
    .eq("record_id", record.id);

  if (deleteResult.error) {
    throw new GoogleApiError(deleteResult.error.message, "SUPABASE_ERROR");
  }

  if (entries.length) {
    const entriesResult = await supabase
      .from("staff_training_entries")
      .insert(entries);

    if (entriesResult.error) {
      throw new GoogleApiError(
        entriesResult.error.message,
        "SUPABASE_ERROR"
      );
    }
  }

  return {
    ...record,
    createdAt,
    updatedAt
  };
}

export async function deleteStaffTrainingRecord(recordId: string) {
  const entriesResult = await supabase
    .from("staff_training_entries")
    .delete()
    .eq("record_id", recordId);

  if (entriesResult.error) {
    throw new GoogleApiError(entriesResult.error.message, "SUPABASE_ERROR");
  }

  const recordResult = await supabase
    .from("staff_training_records")
    .delete()
    .eq("id", recordId);

  if (recordResult.error) {
    throw new GoogleApiError(recordResult.error.message, "SUPABASE_ERROR");
  }

  return { recordId };
}

export async function setupStaffTraining() {
  return { message: "Staff Training tables are managed in Supabase." };
}
