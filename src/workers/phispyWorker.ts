/// <reference lib="webworker" />
/// <reference types="vite/client" />

import { loadPyodide, type PyodideInterface } from "pyodide";

// Pyodide version constant – update here to upgrade
const PYODIDE_VERSION = "0.29.3";
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// GitHub Releases API endpoint for the latest PhiSpy release
const PHISPY_RELEASE_API_URL =
  "https://api.github.com/repos/linsalrob/PhiSpy/releases/latest";



// ── GitHub Releases API types ─────────────────────────────────────────────────

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
  content_type?: string;
};

type GitHubRelease = {
  tag_name: string;
  name?: string;
  html_url?: string;
  assets: GitHubReleaseAsset[];
};

type PhiSpyWheelResolution = {
  version: string;
  tagName: string;
  wheelName: string;
  wheelUrl: string;
  releaseUrl?: string;
  size?: number;
};

// ── Local-manifest types ──────────────────────────────────────────────────────

type WheelManifest = {
  phispy: {
    version: string;
    tag?: string;
    wheel: string;
    source?: string;
  };
};

// ── Wheel resolvers ───────────────────────────────────────────────────────────

async function resolveLatestPhiSpyPyodideWheel(
  pyTag?: string
): Promise<PhiSpyWheelResolution> {
  postStatus("Fetching latest PhiSpy release metadata", {
    releaseApiUrl: PHISPY_RELEASE_API_URL,
  });

  const response = await fetch(PHISPY_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest PhiSpy release metadata: ${response.status} ${response.statusText}`
    );
  }

  const release = (await response.json()) as GitHubRelease;

  if (!release.assets || release.assets.length === 0) {
    throw new Error(
      `Latest PhiSpy release ${release.tag_name} has no downloadable assets`
    );
  }

  postStatus("Found latest PhiSpy release", {
    tagName: release.tag_name,
    releaseUrl: release.html_url,
    assetNames: release.assets.map((asset) => asset.name),
  });

  const wheelCandidates = release.assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return (
      name.endsWith(".whl") &&
      (name.includes("emscripten") ||
        name.includes("pyodide") ||
        name.includes("wasm32") ||
        name.includes("py3-none-any"))
    );
  });

  if (wheelCandidates.length === 0) {
    throw new Error(
      `No Pyodide/Emscripten-compatible PhiSpy wheel found on release ${release.tag_name}. ` +
        `Available assets: ${release.assets.map((asset) => asset.name).join(", ")}`
    );
  }

  // Prefer wheels that match the running Python version (e.g. cp313 > cp312 > generic).
  // Within the same Python-version tier, prefer explicit Emscripten/Pyodide/WASM wheels
  // over generic pure-Python wheels.
  wheelCandidates.sort((a, b) => {
    const score = (asset: GitHubReleaseAsset) => {
      const name = asset.name.toLowerCase();
      // Tier 0: exact cpXY match for the running interpreter
      if (pyTag && name.includes(pyTag)) return 0;
      // Tier 1–4: platform-specific wheels without a matching cp tag
      if (name.includes("emscripten")) return 1;
      if (name.includes("pyodide")) return 2;
      if (name.includes("wasm32")) return 3;
      if (name.includes("py3-none-any")) return 4;
      return 9;
    };
    return score(a) - score(b);
  });

  const wheel = wheelCandidates[0];

  postStatus("Selected PhiSpy Pyodide wheel", {
    tagName: release.tag_name,
    wheelName: wheel.name,
    wheelUrl: wheel.browser_download_url,
    size: wheel.size,
  });

  return {
    version: release.tag_name.replace(/^v/, ""),
    tagName: release.tag_name,
    releaseUrl: release.html_url,
    wheelName: wheel.name,
    wheelUrl: wheel.browser_download_url,
    size: wheel.size,
  };
}

async function getPhiSpyWheelUrlFromLocalManifest(): Promise<{
  version: string;
  tag?: string;
  wheel: string;
  url: string;
  source?: string;
}> {
  const manifestUrl = new URL(
    `${import.meta.env.BASE_URL}wheels/manifest.json`,
    self.location.origin
  ).toString();

  postStatus("Using PhiSpy wheel from PhiSpyWeb static wheels manifest", {
    manifestUrl,
  });

  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch PhiSpy wheel manifest: ${response.status} ${response.statusText}`
    );
  }

  const manifest = (await response.json()) as WheelManifest;

  if (!manifest.phispy?.wheel || !manifest.phispy?.version) {
    throw new Error(
      "Invalid PhiSpy wheel manifest: missing phispy.version or phispy.wheel"
    );
  }

  const wheelUrl = new URL(
    `${import.meta.env.BASE_URL}wheels/${manifest.phispy.wheel}`,
    self.location.origin
  ).toString();

  return {
    version: manifest.phispy.version,
    tag: manifest.phispy.tag,
    wheel: manifest.phispy.wheel,
    url: wheelUrl,
    source: manifest.phispy.source,
  };
}

async function verifyWheelUrl(url: string): Promise<void> {
  let response = await fetch(url, { method: "HEAD" });

  if (!response.ok) {
    postStatus("PhiSpy wheel HEAD check failed; trying GET check", {
      url,
      status: response.status,
      statusText: response.statusText,
    });

    response = await fetch(url, { method: "GET" });
  }

  postStatus("PhiSpy wheel URL check", {
    url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
  });

  if (!response.ok) {
    throw new Error(
      `PhiSpy wheel URL is not reachable: ${response.status} ${response.statusText}`
    );
  }
}

let pyodide: PyodideInterface | null = null;
let phispyReady = false;

const initStart = performance.now();

function postStatus(message: string, details?: Record<string, unknown>) {
  const elapsedMs = Math.round(performance.now() - initStart);
  if (details !== undefined) {
    console.log("[PhiSpyWorker]", message, details);
  } else {
    console.log("[PhiSpyWorker]", message);
  }
  postMessage({
    type: "status",
    message,
    details,
    timestamp: new Date().toISOString(),
    elapsedMs,
  });
}

async function withProgressTimeout<T>(
  label: string,
  promise: Promise<T>,
  warnAfterMs = 30000
): Promise<T> {
  const warnAfterSec = warnAfterMs / 1000;
  const timer = setTimeout(() => {
    postStatus(`Still working: ${label} has been running for ${warnAfterSec} seconds`);
  }, warnAfterMs);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}

async function initPyodide(): Promise<void> {
  postStatus("Using Pyodide URLs", {
    PYODIDE_VERSION,
    PYODIDE_BASE_URL,
  });

  postStatus("Importing loadPyodide from pyodide package");
  postStatus("Calling loadPyodide");
  pyodide = await withProgressTimeout(
    "loadPyodide",
    loadPyodide({
      indexURL: PYODIDE_BASE_URL,
      stdout: (text: string) => postMessage({ type: "stdout", text }),
      stderr: (text: string) => postMessage({ type: "stderr", text }),
    })
  );
  postStatus("Finished loadPyodide");

  postStatus("Running Pyodide smoke test");
  const pythonVersion = await pyodide.runPythonAsync(`
import sys
sys.version
`);
  postStatus("Pyodide smoke test complete", { pythonVersion: String(pythonVersion) });

  postStatus("Loading micropip");
  await withProgressTimeout("loadPackage(micropip)", pyodide.loadPackage("micropip"));
  postStatus("Finished loading micropip");

  // Detect the Python version running inside Pyodide so we can prefer the
  // matching wheel (e.g. cp313 for Python 3.13).
  const pythonVersionInfo = await pyodide.runPythonAsync(`
import sys
{
    "major": sys.version_info.major,
    "minor": sys.version_info.minor,
    "cache_tag": sys.implementation.cache_tag,
    "version": sys.version,
}
`);
  postStatus("Detected Pyodide Python version", pythonVersionInfo.toJs({ dict_converter: (entries: Iterable<[string, unknown]>) => Object.fromEntries(entries) }));
  const pyTag = `cp${pythonVersionInfo.get("major")}${pythonVersionInfo.get("minor")}`;

  // Resolve the wheel to install from the local static manifest (pre-populated
  // by scripts/sync-latest-phispy-wheel.mjs).  The GitHub Releases API is still
  // used separately to log which version is available upstream, but the actual
  // micropip.install() call always uses the mirrored wheel on the PhiSpyWeb
  // GitHub Pages origin to avoid GitHub release CORS restrictions.
  let wheelUrl: string;
  let wheelVersion: string;
  let wheelName: string | undefined;

  // Log the latest upstream release for informational purposes.
  try {
    const upstream = await resolveLatestPhiSpyPyodideWheel(pyTag);
    postStatus("Latest PhiSpy upstream wheel identified (informational)", {
      version: upstream.version,
      tagName: upstream.tagName,
      wheelName: upstream.wheelName,
      source: upstream.wheelUrl,
    });
  } catch (error) {
    postStatus("Could not fetch upstream PhiSpy release info (non-fatal)", {
      error: String(error),
    });
  }

  // Always install from the local static wheel served from this origin.
  const local = await getPhiSpyWheelUrlFromLocalManifest();
  wheelUrl = local.url;
  wheelVersion = local.version;
  wheelName = local.wheel;

  postStatus("Installing PhiSpy wheel from PhiSpyWeb static wheels", {
    version: wheelVersion,
    tag: local.tag,
    wheelName,
    wheelUrl,
    source: local.source,
  });

  postStatus(`Installing PhiSpy wheel from ${wheelUrl}`);

  await verifyWheelUrl(wheelUrl);

  postStatus("Installing PhiSpy wheel with micropip", {
    wheelName,
    wheelUrl,
  });

  try {
    await withProgressTimeout(
      "micropip.install(phispy wheel)",
      pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(wheelUrl)})
`)
    );
  } catch (err) {
    postStatus("micropip.install failed for selected PhiSpy wheel", {
      wheelName,
      wheelUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  postStatus("Finished installing PhiSpy wheel", {
    version: wheelVersion,
    ...(wheelName ? { wheelName } : {}),
  });

  await pyodide.runPythonAsync(`
import importlib.metadata

for dist_name in ("phispy", "PhiSpy"):
    try:
        print("PhiSpy distribution version:", importlib.metadata.version(dist_name))
        break
    except importlib.metadata.PackageNotFoundError:
        pass
else:
    print("PhiSpy distribution version: unknown (distribution not found under 'phispy' or 'PhiSpy')")
`);

  postStatus("Inspecting installed PhiSpy-related modules");
  await pyodide.runPythonAsync(`
import pkgutil

mods = [
    m.name for m in pkgutil.iter_modules()
    if "phispy" in m.name.lower() or "phispymodules" in m.name.lower()
]
print("Matching installed modules:", mods)
`);

  // The PyPI/distribution package is PhiSpy and the console script is `phispy`,
  // but the importable Python package is `PhiSpyModules`.
  postStatus("Importing PhiSpyModules");
  await pyodide.runPythonAsync(`
import PhiSpyModules
import pkgutil

print("PhiSpyModules imported successfully")
print("PhiSpyModules file:", getattr(PhiSpyModules, "__file__", None))
print("PhiSpyModules attributes:", sorted([a for a in dir(PhiSpyModules) if "pyodide" in a.lower() or "ensure" in a.lower()]))

mods = [
    m.name for m in pkgutil.iter_modules(PhiSpyModules.__path__)
    if "pyodide" in m.name.lower() or "main" in m.name.lower()
]
print("Relevant PhiSpyModules submodules:", mods)
`);
  postStatus("PhiSpyModules import succeeded");

  postStatus("Checking for PhiSpyModules Pyodide dependency setup");
  await withProgressTimeout(
    "PhiSpyModules.ensure_pyodide_deps",
    pyodide.runPythonAsync(`
try:
    from PhiSpyModules import ensure_pyodide_deps
    print("Found ensure_pyodide_deps in PhiSpyModules")
    await ensure_pyodide_deps()
    print("ensure_pyodide_deps succeeded from PhiSpyModules")
except ImportError:
    try:
        from PhiSpyModules.pyodide_deps import ensure_pyodide_deps
        print("Found ensure_pyodide_deps in PhiSpyModules.pyodide_deps")
        await ensure_pyodide_deps()
        print("ensure_pyodide_deps succeeded from PhiSpyModules.pyodide_deps")
    except ImportError:
        print("No ensure_pyodide_deps function found; continuing without it")
`)
  );
  postStatus("Finished PhiSpy Pyodide dependency setup check");

  phispyReady = true;
  postStatus("Pyodide and PhiSpy are ready");

  postMessage({ type: "status", message: "ready", timestamp: new Date().toISOString(), elapsedMs: Math.round(performance.now() - initStart) });
}

async function runPhiSpyInPyodide(
  filename: string,
  fileBuffer: ArrayBuffer,
  params: {
    phageGenes: number;
    windowSize: number;
    minContigSize: number;
    outputChoice: number;
    trainingSet: string;
  }
): Promise<void> {
  if (!pyodide) throw new Error("Pyodide not initialised");

  const inputDir = "/work/input";
  const outputDir = "/work/output";

  // Clean up from any previous run
  await pyodide.runPythonAsync(`
import os, shutil
if os.path.exists("/work"):
    shutil.rmtree("/work")
os.makedirs("/work/input", exist_ok=True)
os.makedirs("/work/output", exist_ok=True)
`);

  // Write input file
  const inputPath = `${inputDir}/input.gbk`;
  pyodide.FS.writeFile(inputPath, new Uint8Array(fileBuffer));

  postMessage({ type: "status", message: "Running PhiSpy…" });

  await pyodide.runPythonAsync(`
import sys
import importlib.metadata

# Print PhiSpy version to stderr before processing begins
phispy_version = importlib.metadata.version("PhiSpy")
print(f"Currently running PhiSpy version {phispy_version}", file=sys.stderr)

# The PyPI/distribution package is PhiSpy and the console script is \`phispy\`,
# but the importable Python package is PhiSpyModules.
# The package metadata maps both PhiSpy.py and phispy console scripts to
# PhiSpyModules.main:run, so we call that entry point directly.
from PhiSpyModules.main import run

input_path = "/work/input/input.gbk"
output_dir = "/work/output"
phage_genes = ${params.phageGenes}
window_size = ${params.windowSize}
min_contig_size = ${params.minContigSize}
output_choice = ${params.outputChoice}
training_set = ${JSON.stringify(params.trainingSet)}

sys.argv = [
    "PhiSpy.py",
    input_path,
    "-o", output_dir,
    "--training_set", training_set,
    "--phage_genes", str(phage_genes),
    "--window_size", str(window_size),
    "--min_contig_size", str(min_contig_size),
    "--output_choice", str(output_choice),
]

run()
`);

  postMessage({ type: "status", message: "Collecting output files…" });

  // Collect output files
  const files: Array<{ filename: string; content: string; mimeType: string }> = [];

  const collectFiles = (dir: string) => {
    let entries: string[];
    try {
      entries = pyodide!.FS.readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "." || entry === "..") continue;
      const fullPath = `${dir}/${entry}`;
      let stat;
      try {
        stat = pyodide!.FS.stat(fullPath);
      } catch {
        continue;
      }
      // Check if directory (mode & 0o170000) === 0o040000
      if ((stat.mode & 0o170000) === 0o040000) {
        collectFiles(fullPath);
      } else {
        try {
          const content = pyodide!.FS.readFile(fullPath, { encoding: "utf8" });
          const relPath = fullPath.replace(`${outputDir}/`, "");
          const mimeType = mimeTypeFor(entry);
          files.push({ filename: relPath, content, mimeType });
        } catch {
          // Skip unreadable files
        }
      }
    }
  };

  collectFiles(outputDir);

  // Parse coordinates
  const coordsFile = files.find(
    (f) => f.filename.includes("prophage_coordinates") || f.filename.includes("coordinates")
  );

  let coordinates: Array<{
    prophage?: string;
    contig?: string;
    start?: number;
    stop?: number;
    length?: number;
    raw: Record<string, string>;
  }> = [];

  if (coordsFile) {
    coordinates = parseCoordsContent(coordsFile.content);
  }

  const result = {
    summary: {
      inputFilename: filename,
      prophageCount: coordinates.length,
      outputFileCount: files.length,
    },
    coordinates,
    files,
    stdout: [],
    stderr: [],
  };

  postMessage({ type: "result", result });
}

function mimeTypeFor(filename: string): string {
  if (filename.endsWith(".tsv")) return "text/tab-separated-values";
  if (filename.endsWith(".csv")) return "text/csv";
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".bed")) return "text/plain";
  if (
    filename.endsWith(".fasta") ||
    filename.endsWith(".fa") ||
    filename.endsWith(".ffn") ||
    filename.endsWith(".fna")
  )
    return "text/plain";
  if (filename.endsWith(".gb") || filename.endsWith(".gbk") || filename.endsWith(".gbff"))
    return "text/plain";
  return "text/plain";
}

function parseCoordsContent(
  content: string
): Array<{
  prophage?: string;
  contig?: string;
  start?: number;
  stop?: number;
  length?: number;
  raw: Record<string, string>;
}> {
  const lines = content.trim().split("\n");
  if (lines.length < 1) return [];

  const firstLineCells = lines[0].split("\t").map((h) => h.trim().toLowerCase());

  // Known header field names; if any appear in the first row, treat it as a header.
  const knownFields = new Set([
    "prophage_id", "prophage", "id", "name", "pp",
    "contig_id", "contig", "accno", "sequence", "accession",
    "start", "start_position", "begin",
    "stop", "end", "end_position", "stop_position",
  ]);

  const hasHeader = firstLineCells.some((h) => knownFields.has(h));
  const results = [];

  if (hasHeader) {
    // Header-based parsing: first line is column names, data starts at line 1.
    if (lines.length < 2) return [];
    const headers = firstLineCells;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells = line.split("\t");
      const raw: Record<string, string> = {};
      headers.forEach((h, idx) => {
        raw[h] = cells[idx]?.trim() ?? "";
      });

      const prophage = findField(raw, ["prophage_id", "prophage", "id", "name", "pp"]);
      const contig = findField(raw, ["contig_id", "contig", "accno", "sequence", "accession"]);
      const startRaw = findField(raw, ["start", "start_position", "begin"]);
      const stopRaw = findField(raw, ["stop", "end", "end_position", "stop_position"]);
      const start = startRaw !== undefined ? parseInt(startRaw, 10) : undefined;
      const stop = stopRaw !== undefined ? parseInt(stopRaw, 10) : undefined;
      const length =
        start !== undefined && stop !== undefined && !isNaN(start) && !isNaN(stop)
          ? Math.abs(stop - start)
          : undefined;

      results.push({ prophage, contig, start, stop, length, raw });
    }
  } else {
    // Positional parsing: no header row. PhiSpy's prophage_coordinates.tsv uses
    // fixed columns: col 0 = prophage id, col 1 = contig, col 2 = start, col 3 = stop,
    // col 4 = att sites (optional).
    const posHeaders = ["pp", "contig", "start", "stop", "att"];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells = line.split("\t");
      const raw: Record<string, string> = {};
      posHeaders.forEach((h, idx) => {
        if (cells[idx] !== undefined) raw[h] = cells[idx].trim();
      });

      const prophage = cells[0]?.trim() || undefined;
      const contig = cells[1]?.trim() || undefined;
      const startRaw = cells[2]?.trim();
      const stopRaw = cells[3]?.trim();
      const start = startRaw ? parseInt(startRaw, 10) : undefined;
      const stop = stopRaw ? parseInt(stopRaw, 10) : undefined;
      const length =
        start !== undefined && stop !== undefined && !isNaN(start) && !isNaN(stop)
          ? Math.abs(stop - start)
          : undefined;

      results.push({ prophage, contig, start, stop, length, raw });
    }
  }

  return results;
}

function findField(
  raw: Record<string, string>,
  candidates: string[]
): string | undefined {
  for (const key of candidates) {
    if (key in raw && raw[key] !== "") return raw[key];
  }
  return undefined;
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  console.log("[PhiSpyWorker message]", event.data);
  const msg = event.data;

  if (msg.type === "init") {
    postStatus("Worker received init request");
    if (phispyReady) {
      postMessage({ type: "status", message: "ready", timestamp: new Date().toISOString(), elapsedMs: Math.round(performance.now() - initStart) });
      return;
    }
    try {
      await initPyodide();
    } catch (err) {
      const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error("[PhiSpyWorker] Pyodide/PhiSpy initialisation failed", err);
      postMessage({
        type: "error",
        message: "Pyodide/PhiSpy initialisation failed",
        details,
        timestamp: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - initStart),
      });
    }
  } else if (msg.type === "run") {
    try {
      await runPhiSpyInPyodide(msg.filename, msg.fileBuffer, msg.params);
    } catch (err) {
      const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error("[PhiSpyWorker] PhiSpy run failed", err);
      postMessage({
        type: "error",
        message: "PhiSpy run failed",
        details,
        timestamp: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - initStart),
      });
    }
  }
};
