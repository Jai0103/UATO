export type StaffTrainingType =
  | "induction"
  | "currency"
  | "upgrade";

export type StaffTrainingItemStatus =
  | ""
  | "not_completed"
  | "in_progress"
  | "completed";

export type StaffTrainingDescriptionStatus =
  | "active"
  | "inactive";

export type StaffTrainingDescription = {
  id: string;
  trainingType: StaffTrainingType;
  description: string;
  sortOrder: number;
  status: StaffTrainingDescriptionStatus;
};

export type StaffTrainingEntry = {
  itemId: string;
  trainingType: StaffTrainingType;
  description: string;
  sortOrder: number;
  status: StaffTrainingItemStatus;
  dateCompleted: string;
  remarks: string;
};

export type StaffTrainingRecord = {
  id: string;
  staffName: string;
  staffEmail: string;
  designation: string;
  headOfTrainingName: string;
  signatureDataUrl: string;
  items: StaffTrainingEntry[];
  createdAt: string;
  updatedAt: string;
};

export type StaffTrainingRecordSummary = Omit<
  StaffTrainingRecord,
  "items" | "signatureDataUrl"
> & {
  completedCount: number;
  totalCount: number;
};

export const STAFF_TRAINING_LABELS: Record<
  StaffTrainingType,
  string
> = {
  induction: "Induction Training",
  currency: "Currency Training",
  upgrade: "Upgrade Training"
};

export const STAFF_TRAINING_TYPES: StaffTrainingType[] = [
  "induction",
  "currency",
  "upgrade"
];

export const DEFAULT_STAFF_TRAINING_DESCRIPTIONS: StaffTrainingDescription[] = [
  [
    "induction",
    "Familiarisation of the Exposition Document"
  ],
  [
    "induction",
    "Familiarisation of the training materials"
  ],
  [
    "induction",
    "Familiarisation of the Equipment manuals"
  ],
  ["induction", "Conduct demo theory lesson"],
  ["induction", "Conduct demo practical training"],
  [
    "induction",
    "Guidebook for the conduct of practical assessment"
  ],
  ["currency", "Review of the Exposition Document"],
  ["currency", "Review of training materials"],
  ["currency", "Review of equipment"],
  ["currency", "Conduct Theory lesson"],
  ["currency", "Practice of Practical exercises"],
  ["currency", "Conduct Practical training"],
  [
    "currency",
    "Guidebook for the conduct of practical assessment"
  ],
  ["currency", "Conduct of practical assessment"],
  [
    "upgrade",
    "Supervised review of the exposition documents"
  ],
  ["upgrade", "Review of training materials"],
  ["upgrade", "Familiarisation of equipment"],
  ["upgrade", "Supervised conduct of Theory lesson"],
  [
    "upgrade",
    "Supervised practice of Practical exercises"
  ],
  [
    "upgrade",
    "Supervised conduct of Practical Flight training"
  ],
  [
    "upgrade",
    "Guidebook for the conduct of practical assessment"
  ],
  [
    "upgrade",
    "Supervised review of the Practical Assessment checklist and conduct assessment"
  ]
].map(([trainingType, description], index, all) => ({
  id: `default-${trainingType}-${index + 1}`,
  trainingType: trainingType as StaffTrainingType,
  description,
  sortOrder:
    all
      .slice(0, index + 1)
      .filter(([type]) => type === trainingType).length,
  status: "active"
}));

export function createStaffTrainingEntries(
  descriptions: StaffTrainingDescription[],
  existing: StaffTrainingEntry[] = []
) {
  const existingById = new Map(
    existing.map((item) => [item.itemId, item])
  );

  const currentItems = descriptions
    .filter((item) => item.status === "active")
    .sort(
      (a, b) =>
        STAFF_TRAINING_TYPES.indexOf(a.trainingType) -
          STAFF_TRAINING_TYPES.indexOf(b.trainingType) ||
        a.sortOrder - b.sortOrder
    )
    .map((description) => {
      const saved = existingById.get(description.id);

      return {
        itemId: description.id,
        trainingType: description.trainingType,
        description: saved?.description || description.description,
        sortOrder: description.sortOrder,
        status: saved?.status ?? "",
        dateCompleted: saved?.dateCompleted || "",
        remarks: saved?.remarks || ""
      } satisfies StaffTrainingEntry;
    });

  const currentIds = new Set(currentItems.map((item) => item.itemId));
  const historicalItems = existing.filter((item) => !currentIds.has(item.itemId));

  return [...currentItems, ...historicalItems].sort(
    (a, b) =>
      STAFF_TRAINING_TYPES.indexOf(a.trainingType) -
        STAFF_TRAINING_TYPES.indexOf(b.trainingType) ||
      a.sortOrder - b.sortOrder
  );
}
