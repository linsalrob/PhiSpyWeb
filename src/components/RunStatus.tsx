import React from "react";
import type { RunState } from "../lib/phispyTypes";

interface RunStatusProps {
  state: RunState;
  messages: string[];
  error?: string;
  errorDetails?: string;
}

const STATE_LABELS: Record<RunState, string> = {
  idle: "Idle",
  loading: "Loading Pyodide…",
  installing: "Installing PhiSpy…",
  running: "Running PhiSpy…",
  parsing: "Parsing results…",
  complete: "Complete",
  error: "Error",
};

const isSpinning = (state: RunState) =>
  ["loading", "installing", "running", "parsing"].includes(state);

export const RunStatus: React.FC<RunStatusProps> = ({
  state,
  messages,
  error,
  errorDetails,
}) => {
  if (state === "idle") return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <span className={`status-badge status-${state}`}>
        {isSpinning(state) && <span className="spinner" />}
        {STATE_LABELS[state]}
      </span>

      {messages.length > 0 && (
        <div className="status-messages">
          {messages.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>
      )}

      {state === "error" && error && (
        <div className="error-box" style={{ marginTop: "0.75rem" }}>
          <h3>Error</h3>
          <p>{error}</p>
          {errorDetails && <pre>{errorDetails}</pre>}
        </div>
      )}
    </div>
  );
};
