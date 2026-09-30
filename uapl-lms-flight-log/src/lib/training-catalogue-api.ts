"use client";

import { collection, doc, getDoc, getDocs, writeBatch, type DocumentData } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { addFirebaseAuditToBatch } from "@/lib/firebase-audit";

export type CatalogueStatus = "active" | "inactive";
export type TrainingProgramme = { id: string; name: string; code: string; status: CatalogueStatus; createdAt: string; updatedAt: string };
export type TrainingLocation = { id: string; name: string; status: CatalogueStatus; createdAt: string; updatedAt: string };
export type TrainingCatalogue = { programmes: TrainingProgramme[]; locations: TrainingLocation[] };
type AdminActor = { uid: string; name: string; email: string; role: "admin" };

function text(value: unknown) { return String(value ?? "").trim(); }

async function requireAdmin(): Promise<AdminActor> {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  const data = profile.data();
  if (!profile.exists() || data?.status !== "active" || data?.role !== "admin") throw new Error("Administrator access is required.");
  return { uid: user.uid, name: text(data.name) || user.displayName || "Administrator", email: text(data.email) || user.email || "", role: "admin" };
}

function programmeFromDoc(id: string, data: DocumentData): TrainingProgramme {
  return { id, name: text(data.name), code: text(data.code).toUpperCase(), status: data.status === "inactive" ? "inactive" : "active", createdAt: text(data.createdAt), updatedAt: text(data.updatedAt) };
}

function locationFromDoc(id: string, data: DocumentData): TrainingLocation {
  return { id, name: text(data.name), status: data.status === "inactive" ? "inactive" : "active", createdAt: text(data.createdAt), updatedAt: text(data.updatedAt) };
}

export async function fetchTrainingCatalogue(includeInactive = true): Promise<TrainingCatalogue> {
  await requireAdmin();
  const [programmeSnapshot, locationSnapshot] = await Promise.all([getDocs(collection(firestore, "trainingProgrammes")), getDocs(collection(firestore, "trainingLocations"))]);
  return {
    programmes: programmeSnapshot.docs.map((item) => programmeFromDoc(item.id, item.data())).filter((item) => includeInactive || item.status === "active").sort((a, b) => a.name.localeCompare(b.name)),
    locations: locationSnapshot.docs.map((item) => locationFromDoc(item.id, item.data())).filter((item) => includeInactive || item.status === "active").sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function saveTrainingProgramme(input: Pick<TrainingProgramme, "id" | "name" | "code" | "status">) {
  const actor = await requireAdmin();
  const id = input.id || crypto.randomUUID();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name || !code) throw new Error("Programme name and course code are required.");
  const all = await getDocs(collection(firestore, "trainingProgrammes"));
  if (all.docs.some((item) => item.id !== id && (text(item.data().name).toLowerCase() === name.toLowerCase() || text(item.data().code).toLowerCase() === code.toLowerCase()))) throw new Error("A programme with this name or course code already exists.");
  const reference = doc(firestore, "trainingProgrammes", id);
  const existing = await getDoc(reference);
  const previous = existing.exists() ? programmeFromDoc(existing.id, existing.data()) : null;
  const now = new Date().toISOString();
  const programme: TrainingProgramme = { id, name, code, status: input.status, createdAt: previous?.createdAt || now, updatedAt: now };
  const batch = writeBatch(firestore);
  batch.set(reference, { ...programme, nameLower: name.toLowerCase(), codeLower: code.toLowerCase(), schemaVersion: 1 });
  addFirebaseAuditToBatch(batch, { actorUserId: actor.uid, actorName: actor.name, actorEmail: actor.email, actorRole: actor.role, action: previous ? "TRAINING_PROGRAMME_UPDATED" : "TRAINING_PROGRAMME_CREATED", entityType: "trainingCatalogue", entityId: id, entityName: `${name} (${code})`, previousValue: previous, updatedValue: programme });
  await batch.commit();
  return programme;
}

export async function saveTrainingLocation(input: Pick<TrainingLocation, "id" | "name" | "status">) {
  const actor = await requireAdmin();
  const id = input.id || crypto.randomUUID();
  const name = input.name.trim();
  if (!name) throw new Error("Training location is required.");
  const all = await getDocs(collection(firestore, "trainingLocations"));
  if (all.docs.some((item) => item.id !== id && text(item.data().name).toLowerCase() === name.toLowerCase())) throw new Error("This training location already exists.");
  const reference = doc(firestore, "trainingLocations", id);
  const existing = await getDoc(reference);
  const previous = existing.exists() ? locationFromDoc(existing.id, existing.data()) : null;
  const now = new Date().toISOString();
  const location: TrainingLocation = { id, name, status: input.status, createdAt: previous?.createdAt || now, updatedAt: now };
  const batch = writeBatch(firestore);
  batch.set(reference, { ...location, nameLower: name.toLowerCase(), schemaVersion: 1 });
  addFirebaseAuditToBatch(batch, { actorUserId: actor.uid, actorName: actor.name, actorEmail: actor.email, actorRole: actor.role, action: previous ? "TRAINING_LOCATION_UPDATED" : "TRAINING_LOCATION_CREATED", entityType: "trainingCatalogue", entityId: id, entityName: name, previousValue: previous, updatedValue: location });
  await batch.commit();
  return location;
}

export async function deleteTrainingCatalogueItem(type: "programme" | "location", item: TrainingProgramme | TrainingLocation) {
  const actor = await requireAdmin();
  const [evaluations, attendance] = await Promise.all([getDocs(collection(firestore, "evaluationSessions")), getDocs(collection(firestore, "attendanceSessions"))]);
  const used = type === "programme"
    ? evaluations.docs.some((entry) => entry.data().programmeId === item.id || text(entry.data().courseName).toLowerCase() === item.name.toLowerCase()) || attendance.docs.some((entry) => entry.data().programmeId === item.id || text(entry.data().courseName).toLowerCase() === item.name.toLowerCase())
    : evaluations.docs.some((entry) => entry.data().locationId === item.id || text(entry.data().location).toLowerCase() === item.name.toLowerCase());
  if (used) throw new Error("This item is already used by a training record. Set it to inactive instead of deleting it.");
  const collectionName = type === "programme" ? "trainingProgrammes" : "trainingLocations";
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, collectionName, item.id));
  addFirebaseAuditToBatch(batch, { actorUserId: actor.uid, actorName: actor.name, actorEmail: actor.email, actorRole: actor.role, action: type === "programme" ? "TRAINING_PROGRAMME_DELETED" : "TRAINING_LOCATION_DELETED", entityType: "trainingCatalogue", entityId: item.id, entityName: item.name, previousValue: item, updatedValue: null });
  await batch.commit();
}
