import React, { useState, useRef } from "react";

interface LogViewerProps {
  stdout: string[];
  stderr: string[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ stdout, stderr }) => {
  const [tab, setTab] = useState<"stdout" | "stderr">("stdout");
  const logRef = useRef<HTMLDivElement>(null);

  const lines = tab === "stdout" ? stdout : stderr;

  const handleCopy = async () => {
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  return (
    <div>
      <div className="log-header">
        <div className="log-tabs">
          <button
            className={`log-tab${tab === "stdout" ? " active" : ""}`}
            onClick={() => setTab("stdout")}
            type="button"
          >
            stdout ({stdout.length})
          </button>
          <button
            className={`log-tab${tab === "stderr" ? " active" : ""}`}
            onClick={() => setTab("stderr")}
            type="button"
          >
            stderr ({stderr.length})
          </button>
        </div>
        <button
          className="btn btn-secondary btn-small"
          onClick={handleCopy}
          type="button"
        >
          Copy
        </button>
      </div>

      <div
        ref={logRef}
        className="log-viewer"
        role="log"
        aria-label={`${tab} log`}
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <span className="log-empty">No {tab} output.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`log-${tab}`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
