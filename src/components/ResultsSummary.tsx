import React from "react";
import type { PhiSpyRunResult } from "../lib/phispyTypes";

interface ResultsSummaryProps {
  result: PhiSpyRunResult;
}

export const ResultsSummary: React.FC<ResultsSummaryProps> = ({ result }) => {
  const { summary } = result;
  return (
    <div className="summary-grid">
      <div className="summary-stat">
        <span className="stat-value">
          {summary.inputFilename.split("/").pop() ?? summary.inputFilename}
        </span>
        <div className="stat-label">Input file</div>
      </div>
      <div className="summary-stat">
        <span className="stat-value" style={{ color: "var(--color-prophage)" }}>
          {summary.prophageCount}
        </span>
        <div className="stat-label">Predicted prophages</div>
      </div>
      <div className="summary-stat">
        <span className="stat-value">{summary.outputFileCount}</span>
        <div className="stat-label">Output files</div>
      </div>
    </div>
  );
};
