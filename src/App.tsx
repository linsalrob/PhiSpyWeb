import React, { useState, useCallback, useRef, useEffect } from "react";
import { FileUpload } from "./components/FileUpload";
import { ParameterPanel } from "./components/ParameterPanel";
import { RunStatus } from "./components/RunStatus";
import { ResultsSummary } from "./components/ResultsSummary";
import { ProphageTable } from "./components/ProphageTable";
import { GenomeTrack } from "./components/GenomeTrack";
import { OutputDownloads } from "./components/OutputDownloads";
import { LogViewer } from "./components/LogViewer";
import { PhiSpyWorkerClient } from "./lib/workerClient";
import type { PhiSpyRunParameters, PhiSpyRunResult, PhiSpyTrainingSetOption, RunState } from "./lib/phispyTypes";
import { defaultParams } from "./lib/phispyTypes";
import { parseTrainingSetManifest, FALLBACK_TRAINING_SETS } from "./lib/parseTrainingSets";
import type { ParsedContigLengths } from "./lib/genomeTrack";
import { parseContigLengthsFromGenBank } from "./lib/genomeTrack";

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [params, setParams] = useState<PhiSpyRunParameters>({ ...defaultParams });
  const [runState, setRunState] = useState<RunState>("idle");
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [stdout, setStdout] = useState<string[]>([]);
  const [stderr, setStderr] = useState<string[]>([]);
  const [result, setResult] = useState<PhiSpyRunResult | null>(null);
  const [parsedLengths, setParsedLengths] = useState<ParsedContigLengths | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [errorDetails, setErrorDetails] = useState<string | undefined>();
  const [trainingSets, setTrainingSets] = useState<PhiSpyTrainingSetOption[]>([]);
  const [trainingSetsLoading, setTrainingSetsLoading] = useState(true);
  const [trainingSetsError, setTrainingSetsError] = useState(false);
  const [trainingSetVersion, setTrainingSetVersion] = useState<string | undefined>();

  const workerRef = useRef<PhiSpyWorkerClient | null>(null);

  // Create worker on mount, destroy on unmount
  useEffect(() => {
    workerRef.current = new PhiSpyWorkerClient();
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Load training sets from public/training-sets.json on page load
  useEffect(() => {
    const preferredDefault = "data/trainSet_Ecoli.txt";

    const url = new URL(
      `${import.meta.env.BASE_URL}training-sets.json`,
      window.location.origin
    ).toString();

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch training-sets.json: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((json) => {
        const manifest = parseTrainingSetManifest(json);
        const options = manifest.trainingSets;
        const defaultTrainingSet =
          options.find((o) => o.value === preferredDefault)?.value ??
          options[0]?.value ??
          "";
        setTrainingSets(options);
        setTrainingSetVersion(manifest.phispyVersion);
        setTrainingSetsLoading(false);
        setParams((prev) =>
          prev.trainingSet === "" ? { ...prev, trainingSet: defaultTrainingSet } : prev
        );
      })
      .catch((err: unknown) => {
        console.warn("Could not load training-sets.json, using fallback:", err);
        const defaultTrainingSet =
          FALLBACK_TRAINING_SETS.find((o) => o.value === preferredDefault)?.value ??
          FALLBACK_TRAINING_SETS[0]?.value ??
          "";
        setTrainingSets(FALLBACK_TRAINING_SETS);
        setTrainingSetsError(true);
        setTrainingSetsLoading(false);
        setParams((prev) =>
          prev.trainingSet === "" ? { ...prev, trainingSet: defaultTrainingSet } : prev
        );
      });
  }, []);

  const addStatus = useCallback((msg: string, elapsedMs?: number) => {
    const prefix =
      elapsedMs !== undefined ? `${(elapsedMs / 1000).toFixed(1)}s  ` : "";
    setStatusMessages((prev) => [...prev, `${prefix}${msg}`]);
  }, []);

  const addLog = useCallback((text: string, stream: "stdout" | "stderr") => {
    if (stream === "stdout") {
      setStdout((prev) => [...prev, text]);
    } else {
      setStderr((prev) => [...prev, text]);
    }
  }, []);

  const handleRun = async () => {
    if (!selectedFile) {
      setError("Please select a GenBank file before running.");
      setRunState("error");
      return;
    }

    // Reset state for new run
    setResult(null);
    setParsedLengths(undefined);
    setError(undefined);
    setErrorDetails(undefined);
    setStatusMessages([]);
    setStdout([]);
    setStderr([]);
    setRunState("loading");

    const worker = workerRef.current!;

    try {
      await worker.init(
        (msg, elapsedMs) => {
          addStatus(msg, elapsedMs);
          if (msg.includes("micropip") || msg.includes("PhiSpy") || msg.includes("Installing")) {
            setRunState("installing");
          }
        },
        addLog
      );

      setRunState("running");
      addStatus("Reading file…");

      const [buffer, genbankText] = await Promise.all([
        selectedFile.arrayBuffer(),
        selectedFile.text(),
      ]);

      // Parse contig lengths from the GenBank file for the genome track
      const parsed = parseContigLengthsFromGenBank(genbankText);
      if (parsed.canonical.length > 0) {
        setParsedLengths(parsed);
      }

      addStatus(`Starting PhiSpy on ${selectedFile.name}…`);

      const runResult = await worker.run(
        selectedFile.name,
        buffer,
        params,
        (msg, elapsedMs) => {
          addStatus(msg, elapsedMs);
          if (msg.includes("Parsing") || msg.includes("Collecting")) {
            setRunState("parsing");
          }
        },
        addLog
      );

      setRunState("parsing");
      setResult(runResult);
      setRunState("complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lines = msg.split("\n");
      setError(lines[0]);
      setErrorDetails(lines.slice(1).join("\n") || undefined);
      setRunState("error");
    }
  };

  const isRunning = ["loading", "installing", "running", "parsing"].includes(runState);

  return (
    <>
      <header className="app-header">
        <h1>PhiSpyWeb</h1>
        <div className="tagline">
          Browser-based prophage prediction using PhiSpy, Pyodide, and WebAssembly
        </div>
        <div className="privacy-notice">
          🔒 PhiSpyWeb runs locally in your browser. Your input genome file is not
          uploaded to a server.
        </div>
      </header>

      <main className="app-main">
        {/* Input section */}
        <div className="input-section">
          <div className="card">
            <h2>1. Upload GenBank File</h2>
            <FileUpload
              onFileSelected={setSelectedFile}
              selectedFile={selectedFile}
              disabled={isRunning}
            />
          </div>

          <div className="card">
            <h2>2. Parameters</h2>
            <ParameterPanel
              params={params}
              onChange={setParams}
              disabled={isRunning}
              trainingSets={trainingSets}
              trainingSetsLoading={trainingSetsLoading}
              trainingSetsError={trainingSetsError}
              trainingSetVersion={trainingSetVersion}
            />
          </div>
        </div>

        {/* Run button + status */}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn btn-primary run-btn"
              onClick={handleRun}
              disabled={isRunning || !selectedFile}
              type="button"
            >
              {isRunning ? "Running…" : "▶ Run PhiSpy"}
            </button>

            {!selectedFile && runState === "idle" && (
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
                Select a GenBank file to get started.
              </span>
            )}
          </div>

          <RunStatus
            state={runState}
            messages={statusMessages}
            error={error}
            errorDetails={errorDetails}
          />
        </div>

        {/* Results */}
        {result && (
          <>
            <div className="card">
              <h2>Results Summary</h2>
              <ResultsSummary result={result} />
            </div>

            {result.coordinates.length > 0 && (
              <div className="card">
                <h2>Genome Track</h2>
                <GenomeTrack coordinates={result.coordinates} parsedLengths={parsedLengths} />
              </div>
            )}

            <div className="card">
              <h2>Prophage Coordinates</h2>
              <ProphageTable coordinates={result.coordinates} />
            </div>

            <div className="card">
              <h2>Download Output Files</h2>
              <OutputDownloads files={result.files} />
            </div>

            <div className="card">
              <h2>Logs</h2>
              <LogViewer stdout={result.stdout.concat(stdout)} stderr={result.stderr.concat(stderr)} />
            </div>
          </>
        )}

        {/* Show logs during/after run even without results */}
        {!result && (stdout.length > 0 || stderr.length > 0) && (
          <div className="card">
            <h2>Logs</h2>
            <LogViewer stdout={stdout} stderr={stderr} />
          </div>
        )}

        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--color-text-muted)",
            textAlign: "center",
            marginTop: "1rem",
          }}
        >
          For large batch analyses, command-line PhiSpy remains the recommended
          option.
        </div>
      </main>

      <footer className="app-footer">
        PhiSpyWeb &mdash; powered by{" "}
        <a
          href="https://github.com/linsalrob/PhiSpy"
          target="_blank"
          rel="noopener noreferrer"
        >
          PhiSpy
        </a>{" "}
        and{" "}
        <a
          href="https://pyodide.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Pyodide
        </a>
        . Source on{" "}
        <a
          href="https://github.com/linsalrob/PhiSpyWeb"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </footer>
    </>
  );
}
