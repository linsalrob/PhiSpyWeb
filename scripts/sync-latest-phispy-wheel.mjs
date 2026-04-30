#!/usr/bin/env node
/**
 * sync-latest-phispy-wheel.mjs
 *
 * Fetches the latest PhiSpy release from GitHub, finds the Pyodide-compatible
 * wheel, downloads it into public/wheels/, and writes public/wheels/manifest.json.
 *
 * Usage:
 *   node scripts/sync-latest-phispy-wheel.mjs
 *
 * Environment variables:
 *   GITHUB_TOKEN  Optional. Set to avoid GitHub API rate limits.
 *   PYODIDE_PYTHON_TAG  Optional. Defaults to "cp313".
 *   PYODIDE_ABI_TAG     Optional. Defaults to "pyodide_2025_0".
 *   PYODIDE_PLATFORM    Optional. Defaults to "wasm32".
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { pipeline } from "stream/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const WHEELS_DIR = join(REPO_ROOT, "public", "wheels");
const MANIFEST_PATH = join(WHEELS_DIR, "manifest.json");

const PHISPY_RELEASE_API_URL =
  "https://api.github.com/repos/linsalrob/PhiSpy/releases/latest";

// Preferred Pyodide tags – can be overridden via env vars
const PYODIDE_PYTHON_TAG = process.env.PYODIDE_PYTHON_TAG ?? "cp313";
const PYODIDE_ABI_TAG = process.env.PYODIDE_ABI_TAG ?? "pyodide_2025_0";
const PYODIDE_PLATFORM = process.env.PYODIDE_PLATFORM ?? "wasm32";

async function fetchJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "PhiSpyWeb-sync-script",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `GET ${url} failed: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
}

async function downloadFile(url, destPath) {
  const headers = { "User-Agent": "PhiSpyWeb-sync-script" };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Download ${url} failed: ${response.status} ${response.statusText}`
    );
  }

  const out = createWriteStream(destPath);
  await pipeline(response.body, out);
}

function scoreWheel(name) {
  const lower = name.toLowerCase();
  // Tier 0: exact match for all three preferred tags
  if (
    lower.includes(PYODIDE_PYTHON_TAG) &&
    lower.includes(PYODIDE_ABI_TAG) &&
    lower.includes(PYODIDE_PLATFORM)
  ) {
    return 0;
  }
  // Tier 1: matches python tag + platform
  if (lower.includes(PYODIDE_PYTHON_TAG) && lower.includes(PYODIDE_PLATFORM)) {
    return 1;
  }
  // Tier 2: matches python tag only
  if (lower.includes(PYODIDE_PYTHON_TAG)) return 2;
  // Tier 3: generic pyodide/emscripten/wasm wheel
  if (lower.includes("pyodide") || lower.includes("emscripten") || lower.includes("wasm32")) return 3;
  // Tier 4: pure Python wheel
  if (lower.includes("py3-none-any")) return 4;
  return 9;
}

async function main() {
  console.log("Fetching latest PhiSpy release from", PHISPY_RELEASE_API_URL);
  const release = await fetchJson(PHISPY_RELEASE_API_URL);

  const tagName = release.tag_name;
  const version = tagName.replace(/^v/, "");
  console.log(`Latest PhiSpy release: ${tagName}`);
  console.log(
    "Assets:",
    release.assets.map((a) => a.name)
  );

  const candidates = release.assets.filter((asset) => {
    const lower = asset.name.toLowerCase();
    return (
      lower.endsWith(".whl") &&
      (lower.includes("emscripten") ||
        lower.includes("pyodide") ||
        lower.includes("wasm32") ||
        lower.includes("py3-none-any"))
    );
  });

  if (candidates.length === 0) {
    throw new Error(
      `No Pyodide-compatible wheel found in release ${tagName}. ` +
        `Available assets: ${release.assets.map((a) => a.name).join(", ")}`
    );
  }

  candidates.sort((a, b) => scoreWheel(a.name) - scoreWheel(b.name));
  const selected = candidates[0];

  console.log(`Selected wheel: ${selected.name}`);
  console.log(`Download URL:   ${selected.browser_download_url}`);

  // Ensure output directory exists
  if (!existsSync(WHEELS_DIR)) {
    mkdirSync(WHEELS_DIR, { recursive: true });
  }

  const destPath = join(WHEELS_DIR, selected.name);

  // Check if the correct wheel is already present
  if (existsSync(destPath)) {
    console.log(`Wheel already present at ${destPath}, skipping download.`);
  } else {
    // Remove stale wheels for the same package
    const { readdirSync, unlinkSync } = await import("fs");
    const existing = readdirSync(WHEELS_DIR).filter(
      (f) => f.toLowerCase().startsWith("phispy-") && f.toLowerCase().endsWith(".whl")
    );
    for (const old of existing) {
      console.log(`Removing stale wheel: ${old}`);
      unlinkSync(join(WHEELS_DIR, old));
    }

    console.log(`Downloading wheel to ${destPath} …`);
    await downloadFile(selected.browser_download_url, destPath);
    console.log("Download complete.");
  }

  // Write manifest
  const manifest = {
    phispy: {
      version,
      tag: tagName,
      wheel: selected.name,
      source: selected.browser_download_url,
    },
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Manifest written to ${MANIFEST_PATH}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error("sync-latest-phispy-wheel failed:", err);
  process.exit(1);
});
