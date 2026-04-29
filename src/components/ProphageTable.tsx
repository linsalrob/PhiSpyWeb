import React from "react";
import type { ProphageCoordinate } from "../lib/phispyTypes";

interface ProphageTableProps {
  coordinates: ProphageCoordinate[];
}

export const ProphageTable: React.FC<ProphageTableProps> = ({
  coordinates,
}) => {
  if (coordinates.length === 0) {
    return (
      <div className="no-results">
        No prophage coordinates found. Check the log output for details.
      </div>
    );
  }

  // Collect all raw column names
  const allKeys = Array.from(
    new Set(coordinates.flatMap((c) => Object.keys(c.raw)))
  );

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            {allKeys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {coordinates.map((coord, i) => (
            <tr key={i}>
              {allKeys.map((k) => (
                <td key={k}>{coord.raw[k] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
