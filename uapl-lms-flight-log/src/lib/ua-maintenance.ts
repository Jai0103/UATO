export type UaMaintenanceStatus = "" | "pass" | "fail" | "na";

export type UaMaintenanceMasterStatus = "active" | "inactive";

export type UaMaintenanceMasterSection =
  | "uaModels"
  | "uaIds"
  | "descriptions";

export type UaMaintenanceMasterItem = {
  id: string;
  value: string;
  sortOrder: number;
  status: UaMaintenanceMasterStatus;
};

export type UaMaintenanceMasterData = Record<
  UaMaintenanceMasterSection,
  UaMaintenanceMasterItem[]
>;

export type UaMaintenanceEntry = {
  itemId: string;
  description: string;
  sortOrder: number;
  status: UaMaintenanceStatus;
  remarks: string;
};

export type UaMaintenanceRecord = {
  id: string;
  uaModel: string;
  uaId: string;
  inspectionDate: string;
  recommendation: string;
  checkedByName: string;
  checkedByIdNo: string;
  signatureDataUrl: string;
  items: UaMaintenanceEntry[];
  createdAt: string;
  updatedAt: string;
};

export type UaMaintenanceRecordSummary = Omit<
  UaMaintenanceRecord,
  "items" | "signatureDataUrl"
> & {
  passCount: number;
  failCount: number;
  totalCount: number;
};

export const DEFAULT_UA_MAINTENANCE_DESCRIPTIONS = [
  "Dirt and unnecessary materials were removed from the UA",
  "UA chassis and housing were checked for cracks and damages; screws and other components were attached properly. Do not over-tighten screws.",
  "Motors are free turning and free from debris. Turn each motor and confirm it moves smoothly without unnecessary sound.",
  "Check wiring and joints. For exposed wiring, inspect for worn or frayed cables and confirm joints are secure.",
  "Check landing gear or skids. Legs are not bent or cracked and shock absorbers are intact.",
  "Gimbal and camera are intact and the lenses were cleaned.",
  "Propellers are clean with no cracks or bends. Threads are in good condition.",
  "Firmware is updated.",
  "Check control station: antenna and casing are intact, control sticks and buttons operate correctly, and firmware is updated.",
  "UAS interface is working properly.",
  "Aircraft is responding properly to the designated controller."
];

export function createUaMaintenanceEntries(
  descriptions: UaMaintenanceMasterItem[],
  existing: UaMaintenanceEntry[] = []
) {
  const savedById = new Map(
    existing.map((item) => [item.itemId, item])
  );

  const active = descriptions
    .filter((item) => item.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((description) => {
      const saved = savedById.get(description.id);

      return {
        itemId: description.id,
        description: saved?.description || description.value,
        sortOrder: description.sortOrder,
        status: saved?.status ?? "",
        remarks: saved?.remarks || ""
      } satisfies UaMaintenanceEntry;
    });

  const activeIds = new Set(
    active.map((item) => item.itemId)
  );

  const historical = existing.filter(
    (item) => !activeIds.has(item.itemId)
  );

  return [...active, ...historical].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function emptyUaMaintenanceMasterData(): UaMaintenanceMasterData {
  return {
    uaModels: [],
    uaIds: [],
    descriptions: []
  };
}
