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
        <div
          className="diagnostic-log"
          style={{
            marginTop: "0.75rem",
            background: "var(--color-surface, #1e1e2e)",
            border: "1px solid var(--color-border, #444)",
            borderRadius: "4px",
            padding: "0.6rem 0.75rem",
            maxHeight: "16rem",
            overflowY: "auto",
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: "monospace",
              fontSize: "0.8rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.5,
            }}
          >
            {messages.join("\n")}
          </pre>
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
