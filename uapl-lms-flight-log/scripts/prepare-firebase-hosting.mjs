import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = join(appDirectory, "..");
const exportDirectory = join(appDirectory, "out");
const hostingDirectory = join(repositoryDirectory, "firebase-public");
const deployedAppDirectory = join(hostingDirectory, "UATO");

rmSync(hostingDirectory, { force: true, recursive: true });
mkdirSync(hostingDirectory, { recursive: true });
cpSync(exportDirectory, deployedAppDirectory, { recursive: true });

writeFileSync(
  join(hostingDirectory, "index.html"),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/UATO/"><title>AGA Flight Management System</title></head><body><p><a href="/UATO/">Open Flight Management System</a></p></body></html>',
  "utf8"
);

console.log("Firebase Hosting package prepared at firebase-public/UATO.");
