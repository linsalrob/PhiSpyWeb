/// <reference lib="webworker" />

// Pyodide version constant – update here to upgrade
const PYODIDE_VERSION = "0.27.0";

declare function importScripts(...urls: string[]): void;

interface Pyodide {
  loadPackage(pkg: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string, opts: { encoding: "utf8" }): string;
    readdir(path: string): string[];
    stat(path: string): { mode: number };
    unlink(path: string): void;
    rmdir(path: string): void;
  };
}

declare function loadPyodide(opts: {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  indexURL?: string;
}): Promise<Pyodide>;

let pyodide: Pyodide | null = null;
let phispyReady = false;

importScripts(
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`
);

async function initPyodide(): Promise<void> {
  postMessage({ type: "status", message: "Loading Pyodide…" });

  pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
    stdout: (text: string) => postMessage({ type: "stdout", text }),
    stderr: (text: string) => postMessage({ type: "stderr", text }),
  });

  postMessage({ type: "status", message: "Installing PhiSpy via micropip…" });

  await pyodide.loadPackage("micropip");

  await pyodide.runPythonAsync(`
import micropip
import sys

# Install PhiSpy and its dependencies
await micropip.install("phispy")
`);

  // Verify installation and set up any Pyodide-specific dependencies
  await pyodide.runPythonAsync(`
import importlib
import sys

# Verify PhiSpy is importable
spec = importlib.util.find_spec("PhiSpy")
if spec is None:
    spec = importlib.util.find_spec("phispy")
if spec is None:
    raise ImportError("PhiSpy package not found after installation")

# Try to call Pyodide-specific setup if available
try:
    import phispy
    if hasattr(phispy, 'ensure_pyodide_deps'):
        import asyncio
        asyncio.get_event_loop().run_until_complete(phispy.ensure_pyodide_deps())
except Exception as e:
    # Not fatal – continue without Pyodide-specific setup
    print(f"Note: Pyodide deps setup skipped: {e}", file=sys.stderr)
`);

  phispyReady = true;
  postMessage({ type: "status", message: "ready" });
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
  const msg = event.data;

  if (msg.type === "init") {
    if (phispyReady) {
      postMessage({ type: "status", message: "ready" });
      return;
    }
    try {
      await initPyodide();
    } catch (err) {
      postMessage({
        type: "error",
        message: "Failed to initialise Pyodide/PhiSpy",
        details: String(err),
      });
    }
  } else if (msg.type === "run") {
    try {
      await runPhiSpyInPyodide(msg.filename, msg.fileBuffer, msg.params);
    } catch (err) {
      postMessage({
        type: "error",
        message: "PhiSpy run failed",
        details: String(err),
      });
    }
  }
};
