import React from "react";
import type { PhiSpyRunParameters } from "../lib/phispyTypes";
import { defaultParams } from "../lib/phispyTypes";

interface ParameterPanelProps {
  params: PhiSpyRunParameters;
  onChange: (params: PhiSpyRunParameters) => void;
  disabled?: boolean;
}

const OUTPUT_CHOICES = [
  { value: 4, label: "Coordinates only" },
  { value: 512, label: "Standard outputs" },
  { value: 1023, label: "All outputs" },
];

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  params,
  onChange,
  disabled = false,
}) => {
  const set = <K extends keyof PhiSpyRunParameters>(
    key: K,
    value: PhiSpyRunParameters[K]
  ) => {
    onChange({ ...params, [key]: value });
  };

  const parseNum = (val: string, fallback: number): number => {
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
  };

  return (
    <div>
      <div className="param-grid">
        <div className="param-field">
          <label htmlFor="phage-genes">Phage genes threshold</label>
          <span className="param-hint">
            Minimum number of phage genes to call a prophage
          </span>
          <input
            id="phage-genes"
            type="number"
            min={1}
            value={params.phageGenes}
            onChange={(e) => set("phageGenes", parseNum(e.target.value, 1))}
            disabled={disabled}
            className={params.phageGenes < 1 ? "invalid" : ""}
          />
        </div>

        <div className="param-field">
          <label htmlFor="window-size">Sliding window size</label>
          <span className="param-hint">
            Number of genes in the sliding window
          </span>
          <input
            id="window-size"
            type="number"
            min={1}
            value={params.windowSize}
            onChange={(e) => set("windowSize", parseNum(e.target.value, 30))}
            disabled={disabled}
            className={params.windowSize < 1 ? "invalid" : ""}
          />
        </div>

        <div className="param-field">
          <label htmlFor="min-contig">Minimum contig size (bp)</label>
          <span className="param-hint">
            Contigs shorter than this are skipped
          </span>
          <input
            id="min-contig"
            type="number"
            min={1}
            value={params.minContigSize}
            onChange={(e) =>
              set("minContigSize", parseNum(e.target.value, 5000))
            }
            disabled={disabled}
            className={params.minContigSize < 1 ? "invalid" : ""}
          />
        </div>

        <div className="param-field">
          <label htmlFor="output-choice">Output choice</label>
          <span className="param-hint">Which output files to generate</span>
          <select
            id="output-choice"
            value={params.outputChoice}
            onChange={(e) => set("outputChoice", parseInt(e.target.value, 10))}
            disabled={disabled}
          >
            {OUTPUT_CHOICES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="param-actions">
        <button
          className="btn btn-secondary btn-small"
          onClick={() => onChange({ ...defaultParams })}
          disabled={disabled}
          type="button"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
};
