#!/usr/bin/env node
/**
 * Thin JS wrapper — finds and executes the remb binary.
 * This is what runs when users call `remb` after `npm install -g remb`.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";

// 1. Try the binary bundled alongside this script (placed by postinstall)
const localBin = path.join(__dirname, isWin ? "remb.exe" : "remb");

// 2. Fallback: binary on PATH (e.g. installed via Homebrew or direct download)
function findOnPath() {
  const { execSync } = require("child_process");
  try {
    return execSync(isWin ? "where remb" : "which remb", { encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    return null;
  }
}

let bin = null;

if (fs.existsSync(localBin)) {
  try {
    fs.accessSync(localBin, fs.constants.X_OK);
    bin = localBin;
  } catch {}
}

if (!bin) {
  bin = findOnPath();
  // Avoid infinite loop: skip if the found binary IS this script
  if (bin && bin.endsWith("remb.js")) bin = null;
}

if (!bin) {
  console.error(
    "remb: binary not found.\n" +
    "Run `npm install -g remb` again, or install manually:\n" +
    "  https://github.com/richie/remb/releases"
  );
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
