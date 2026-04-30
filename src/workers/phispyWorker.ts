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

  postStatus("Importing PhiSpy");
  await pyodide.runPythonAsync(`
import phispy
print("PhiSpy import succeeded")
`);
  postStatus("PhiSpy import succeeded");

  postStatus("Checking for PhiSpy Pyodide dependency setup");
  await withProgressTimeout(
    "phispy.ensure_pyodide_deps",
    pyodide.runPythonAsync(`
import phispy

if hasattr(phispy, "ensure_pyodide_deps"):
    print("Running phispy.ensure_pyodide_deps()")
    await phispy.ensure_pyodide_deps()
    print("phispy.ensure_pyodide_deps() succeeded")
else:
    print("phispy.ensure_pyodide_deps() not found")
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
import os

# PhiSpy CLI entry point – discovered by inspecting the installed package
# PhiSpy provides a console_scripts entry point at PhiSpy.main:main
# We emulate the CLI by setting sys.argv and calling the entry point.

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

# Try to find and call the correct PhiSpy entry point
try:
    # PhiSpy >= 4.x: entry point is PhiSpy.main
    from PhiSpy import main as phispy_main
    phispy_main()
except ImportError:
    try:
        # Alternative: phispy package with main module
        import phispy.main as pm
        if hasattr(pm, 'main'):
            pm.main()
        else:
            # Fallback: find the script in the package
            import runpy
            import PhiSpy
            pkg_dir = os.path.dirname(PhiSpy.__file__)
            script = os.path.join(pkg_dir, "PhiSpy.py")
            if os.path.exists(script):
                runpy.run_path(script, run_name="__main__")
            else:
                raise RuntimeError(f"Cannot find PhiSpy entry point in {pkg_dir}")
    except ImportError as e:
        raise RuntimeError(f"Cannot import PhiSpy: {e}")
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
