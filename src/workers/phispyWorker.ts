/// <reference lib="webworker" />
/// <reference types="vite/client" />

import { loadPyodide, type PyodideInterface } from "pyodide";

// Pyodide version constant – update here to upgrade
const PYODIDE_VERSION = "0.29.3";
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

type WheelManifest = {
  phispy: {
    version: string;
    wheel: string;
  };
};

async function getPhiSpyWheelUrl(): Promise<{ version: string; url: string }> {
  const manifestUrl = new URL(
    `${import.meta.env.BASE_URL}wheels/manifest.json`,
    self.location.origin
  ).toString();

  postStatus("Fetching PhiSpy wheel manifest", { manifestUrl });

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
    url: wheelUrl,
  };
}

async function verifyWheelUrl(url: string): Promise<void> {
  let response = await fetch(url, { method: "HEAD" });

  if (!response.ok) {
    postStatus("PhiSpy wheel HEAD check failed; trying ranged GET probe", {
      url,
      status: response.status,
      statusText: response.statusText,
    });

    // Use a single-byte ranged request so we verify reachability without
    // downloading the full wheel (which micropip.install will fetch anyway).
    response = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
  }

  postStatus("PhiSpy wheel URL check", {
    url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
  });

  // 206 Partial Content is also a success (ranged GET on a reachable resource).
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

  const { version, url } = await getPhiSpyWheelUrl();

  postStatus("Installing PhiSpy wheel", {
    version,
    wheelUrl: url,
  });

  await verifyWheelUrl(url);

  await withProgressTimeout(
    "micropip.install(phispy wheel)",
    pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(url)})
`)
  );
  postStatus("Finished installing PhiSpy wheel", { version });

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

sys.argv = [
    "PhiSpy.py",
    input_path,
    "-o", output_dir,
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
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split("\t");
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx]?.trim() ?? "";
    });

    const prophage = findField(raw, ["prophage_id", "prophage", "id", "name"]);
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
