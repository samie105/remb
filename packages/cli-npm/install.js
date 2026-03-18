#!/usr/bin/env node
/**
 * postinstall script — downloads the correct remb binary for the current platform
 * from GitHub Releases and saves it to the package's bin/ directory.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = "useremb/remb";
const VERSION = require("./package.json").version;
const BIN_DIR = path.join(__dirname, "bin");
const BIN_PATH = path.join(BIN_DIR, process.platform === "win32" ? "remb.exe" : "remb");

// Skip if binary already exists and is executable
if (fs.existsSync(BIN_PATH)) {
  try {
    fs.accessSync(BIN_PATH, fs.constants.X_OK);
    process.exit(0);
  } catch {}
}

function getPlatformTarget() {
  const { platform, arch } = process;
  const os =
    platform === "darwin" ? "darwin" :
    platform === "linux"  ? "linux"  :
    platform === "win32"  ? "windows" : null;

  const cpu =
    arch === "x64"   ? "amd64" :
    arch === "arm64" ? "arm64" : null;

  if (!os || !cpu) {
    console.error(`remb: unsupported platform ${platform}/${arch}`);
    process.exit(0); // Don't fail install — users can install manually
  }

  const ext = os === "windows" ? ".exe" : "";
  return { filename: `remb-${os}-${cpu}${ext}`, ext };
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest, { mode: 0o755 });
    function get(u) {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${u}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
      }).on("error", reject);
    }
    get(url);
  });
}

async function main() {
  const { filename } = getPlatformTarget();
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${filename}`;

  console.log(`remb: downloading ${filename} from GitHub...`);

  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    await download(url, BIN_PATH);
    fs.chmodSync(BIN_PATH, 0o755);
    console.log(`remb: installed successfully ✔`);
  } catch (err) {
    // Don't fail npm install — binary can be installed manually
    console.warn(`remb: could not download binary (${err.message})`);
    console.warn(`remb: install manually: https://github.com/${REPO}/releases/tag/v${VERSION}`);
  }
}

main();
