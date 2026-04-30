import React, { useMemo } from "react";
import type { ProphageCoordinate } from "../lib/phispyTypes";
import type { ParsedContigLengths } from "../lib/genomeTrack";
import { buildContigLayouts, coordToX } from "../lib/genomeTrack";

interface GenomeTrackProps {
  coordinates: ProphageCoordinate[];
  parsedLengths?: ParsedContigLengths;
}

const TRACK_WIDTH = 800;
const TRACK_HEIGHT = 28;
const LABEL_WIDTH = 160;
const ROW_GAP = 12;
const MIN_BAR_WIDTH = 2;
const MIN_PROPHAGE_WIDTH = 4;

export const GenomeTrack: React.FC<GenomeTrackProps> = ({ coordinates, parsedLengths }) => {
  const layouts = useMemo(
    () => buildContigLayouts(coordinates, parsedLengths),
    [coordinates, parsedLengths]
  );

  // The longest contig defines 100% of TRACK_WIDTH
  const maxLength = useMemo(
    () => Math.max(1, ...layouts.map((l) => l.length)),
    [layouts]
  );

  if (coordinates.length === 0 && layouts.length === 0) return null;

  const svgWidth = LABEL_WIDTH + TRACK_WIDTH + 20;
  const svgHeight =
    layouts.length * (TRACK_HEIGHT + ROW_GAP) + ROW_GAP + 20;

  return (
    <div className="genome-track-container">
      <svg
        className="genome-track-svg"
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label="Genome track visualisation showing predicted prophage regions"
      >
        {layouts.map((layout, idx) => {
          const y = ROW_GAP + idx * (TRACK_HEIGHT + ROW_GAP);
          // Scale the contig bar to reflect its length relative to the longest contig
          const contigBarWidth = coordToX(layout.length, maxLength, TRACK_WIDTH);
          return (
            <g key={layout.contig} transform={`translate(0, ${y})`}>
              {/* Contig label */}
              <text
                className="track-contig-label"
                x={LABEL_WIDTH - 8}
                y={TRACK_HEIGHT / 2 + 4}
                textAnchor="end"
              >
                {layout.contig.length > 18
                  ? layout.contig.slice(0, 16) + "…"
                  : layout.contig}
              </text>

              {/* Contig bar – width proportional to longest contig */}
              <rect
                x={LABEL_WIDTH}
                y={TRACK_HEIGHT / 4}
                width={Math.max(contigBarWidth, MIN_BAR_WIDTH)}
                height={TRACK_HEIGHT / 2}
                rx={3}
                fill="var(--color-contig)"
              />

              {/* Prophage regions – all positions relative to maxLength */}
              {layout.prophages.map((ph, pi) => {
                const x1 = coordToX(ph.start, maxLength, TRACK_WIDTH);
                const x2 = coordToX(ph.stop, maxLength, TRACK_WIDTH);
                const w = Math.max(x2 - x1, MIN_PROPHAGE_WIDTH);
                return (
                  <g key={pi}>
                    <rect
                      x={LABEL_WIDTH + x1}
                      y={2}
                      width={w}
                      height={TRACK_HEIGHT - 4}
                      rx={2}
                      fill="var(--color-prophage)"
                      opacity={0.8}
                    >
                      <title>{ph.id}</title>
                    </rect>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${LABEL_WIDTH}, ${svgHeight - 16})`}>
          <rect width={12} height={10} rx={2} fill="var(--color-contig)" />
          <text x={16} y={9} fontSize={10} fill="var(--color-text-muted)">
            Contig
          </text>
          <rect x={70} width={12} height={10} rx={2} fill="var(--color-prophage)" opacity={0.8} />
          <text x={86} y={9} fontSize={10} fill="var(--color-text-muted)">
            Prophage
          </text>
        </g>
      </svg>
    </div>
  );
};
