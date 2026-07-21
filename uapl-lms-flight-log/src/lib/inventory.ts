export type InventoryMasterStatus = "active" | "inactive";
export type InventoryMasterSection =
  | "equipmentTypes"
  | "storageLocations"
  | "conditions";

export type InventoryMasterItem = {
  id: string;
  value: string;
  sortOrder: number;
  status: InventoryMasterStatus;
};

export type InventoryMasterData = Record<
  InventoryMasterSection,
  InventoryMasterItem[]
>;

export type InventoryOperationalStatus =
  | "operational"
  | "not_operational";

export type InventoryAvailabilityStatus =
  | "available"
  | "in_use"
  | "checked_out"
  | "reserved"
  | "under_maintenance"
  | "quarantined"
  | "missing"
  | "retired";

export type InventoryTransactionAction =
  | "check_out"
  | "return"
  | "transfer"
  | "reserve"
  | "retire";

export type InventoryMaintenanceType =
  | "defect"
  | "inspection"
  | "maintenance";

export type InventoryMaintenanceStatus =
  | "open"
  | "in_progress"
  | "completed";

export type InventoryAsset = {
  id: string;
  assetTag: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  uaRegistrationId: string;
  description: string;
  quantity: number;
  photoDataUrl: string;
  removePhoto?: boolean;
  storageLocation: string;
  storageDetail: string;
  operationalStatus: InventoryOperationalStatus;
  availabilityStatus: InventoryAvailabilityStatus;
  condition: string;
  assignedTo: string;
  dateAdded: string;
  active: boolean;
  batteryChemistry: string;
  batteryCapacityMah: string;
  batteryCellCount: string;
  batteryCycleCount: number;
  batteryMaxCycles: number;
  batteryHealthPercent: number;
  lastInspectionDate: string;
  nextInspectionDue: string;
  remarks: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryAssetSummary = Omit<
  InventoryAsset,
  "photoDataUrl"
> & {
  hasPhoto: boolean;
  openMaintenanceCount: number;
};

export type InventoryTransaction = {
  id: string;
  assetId: string;
  assetTag: string;
  action: InventoryTransactionAction;
  issuedTo: string;
  activity: string;
  fromLocation: string;
  toLocation: string;
  checkoutAt: string;
  expectedReturnAt: string;
  returnedAt: string;
  conditionBefore: string;
  conditionAfter: string;
  performedByName: string;
  performedByEmail: string;
  remarks: string;
  createdAt: string;
};

export type InventoryMaintenance = {
  id: string;
  assetId: string;
  assetTag: string;
  type: InventoryMaintenanceType;
  reportedDate: string;
  completedDate: string;
  status: InventoryMaintenanceStatus;
  defectDescription: string;
  correctiveAction: string;
  inspectedBy: string;
  performedBy: string;
  returnToServiceDate: string;
  documentDataUrl: string;
  documentName: string;
  remarks: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryAssetDetail = {
  asset: InventoryAsset;
  transactions: InventoryTransaction[];
  maintenance: InventoryMaintenance[];
};

export type InventoryDashboard = {
  totalAssets: number;
  availableAssets: number;
  checkedOutAssets: number;
  underMaintenance: number;
  notOperational: number;
  damagedAssets: number;
  overdueReturns: number;
  inspectionsDue: number;
  batteriesNearCycleLimit: number;
};

export type InventoryActivity = {
  id: string;
  assetId: string;
  assetTag: string;
  activityType: "transaction" | "maintenance";
  action: string;
  title: string;
  performedBy: string;
  activityDate: string;
  status: string;
  remarks: string;
};

export const INVENTORY_OPERATIONAL_LABELS: Record<
  InventoryOperationalStatus,
  string
> = {
  operational: "Operational",
  not_operational: "Not Operational"
};

export const INVENTORY_AVAILABILITY_LABELS: Record<
  InventoryAvailabilityStatus,
  string
> = {
  available: "Available",
  in_use: "In Use",
  checked_out: "Checked Out",
  reserved: "Reserved",
  under_maintenance: "Under Maintenance",
  quarantined: "Quarantined",
  missing: "Missing",
  retired: "Retired"
};

export const DEFAULT_INVENTORY_MASTER_DATA: InventoryMasterData = {
  equipmentTypes: [
    "UA - Multirotor",
    "UA - Helicopter",
    "UA - Battery",
    "UA - Controller",
    "UA - Charger",
    "UA - Propeller",
    "UA - Payload / Camera",
    "UA - Simulator",
    "Ground Support Equipment",
    "Tools / Test Equipment",
    "Safety Equipment",
    "Storage / Transport Case",
    "Training Accessories",
    "IT / AV Equipment",
    "Other"
  ].map((value, index) => ({
    id: `equipment-type-${index + 1}`,
    value,
    sortOrder: index + 1,
    status: "active"
  })),
  storageLocations: [
    "Main Equipment Store",
    "Battery Charging Area",
    "Training Room",
    "Kranji",
    "Old Holland Road",
    "Maintenance Area",
    "Assigned to Trainer",
    "External Training Site"
  ].map((value, index) => ({
    id: `storage-location-${index + 1}`,
    value,
    sortOrder: index + 1,
    status: "active"
  })),
  conditions: [
    "New",
    "Excellent",
    "Good",
    "Fair",
    "Damaged",
    "Unserviceable"
  ].map((value, index) => ({
    id: `condition-${index + 1}`,
    value,
    sortOrder: index + 1,
    status: "active"
  }))
};

export function emptyInventoryMasterData(): InventoryMasterData {
  return { equipmentTypes: [], storageLocations: [], conditions: [] };
}

export function createEmptyInventoryAsset(): InventoryAsset {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    assetTag: "",
    equipmentType: "",
    brand: "",
    model: "",
    serialNumber: "",
    uaRegistrationId: "",
    description: "",
    quantity: 1,
    photoDataUrl: "",
    storageLocation: "",
    storageDetail: "",
    operationalStatus: "operational",
    availabilityStatus: "available",
    condition: "Good",
    assignedTo: "",
    dateAdded: now.slice(0, 10),
    active: true,
    batteryChemistry: "",
    batteryCapacityMah: "",
    batteryCellCount: "",
    batteryCycleCount: 0,
    batteryMaxCycles: 0,
    batteryHealthPercent: 100,
    lastInspectionDate: "",
    nextInspectionDue: "",
    remarks: "",
    createdAt: now,
    updatedAt: now
  };
}
