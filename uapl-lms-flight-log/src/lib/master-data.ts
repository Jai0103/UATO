export type MasterDataKey =
  | "locations"
  | "batterySerialNumbers"
  | "afeInstructors"
  | "uaModels"
  | "uaCategories";

export type MasterData = Record<MasterDataKey, string[]>;

export const masterDataKey = "uapl_master_data";

export const defaultMasterData: MasterData = {
  locations: ["Kranji", "Old Holland"],
  batterySerialNumbers: [],
  afeInstructors: [],
  uaModels: [],
  uaCategories: ["M7", "M25", "H"]
};

export const masterDataLabels: Record<MasterDataKey, string> = {
  locations: "Locations",
  batterySerialNumbers: "Battery S/N",
  afeInstructors: "AFE / Instructor",
  uaModels: "UA Model & S/N",
  uaCategories: "UA Categories"
};

export function getMasterData(): MasterData {
  if (typeof window === "undefined") {
    return defaultMasterData;
  }

  const rawData = localStorage.getItem(masterDataKey);

  if (!rawData) {
    return defaultMasterData;
  }

  try {
    const parsedData = JSON.parse(rawData) as Partial<MasterData>;

    return {
      locations: parsedData.locations?.length
        ? parsedData.locations
        : defaultMasterData.locations,
      batterySerialNumbers:
        parsedData.batterySerialNumbers ?? defaultMasterData.batterySerialNumbers,
      afeInstructors: parsedData.afeInstructors ?? defaultMasterData.afeInstructors,
      uaModels: parsedData.uaModels ?? defaultMasterData.uaModels,
      uaCategories: parsedData.uaCategories?.length
        ? parsedData.uaCategories
        : defaultMasterData.uaCategories
    };
  } catch {
    localStorage.removeItem(masterDataKey);
    return defaultMasterData;
  }
}

export function saveMasterData(data: MasterData) {
  localStorage.setItem(masterDataKey, JSON.stringify(data));
}
