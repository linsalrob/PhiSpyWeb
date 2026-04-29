import React from "react";
import type { PhiSpyOutputFile } from "../lib/phispyTypes";
import { downloadFile, downloadAllAsZip, formatBytes } from "../lib/downloadFiles";

interface OutputDownloadsProps {
  files: PhiSpyOutputFile[];
}

export const OutputDownloads: React.FC<OutputDownloadsProps> = ({ files }) => {
  if (files.length === 0) {
    return (
      <div className="no-results">No output files to download.</div>
    );
  }

  return (
    <div>
      <div className="downloads-list">
        {files.map((file) => (
          <div className="download-item" key={file.filename}>
            <span>
              <span className="download-filename">{file.filename}</span>
              <span className="download-size">
                ({formatBytes(new Blob([file.content]).size)})
              </span>
            </span>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => downloadFile(file)}
              type="button"
            >
              Download
            </button>
          </div>
        ))}
      </div>

      <div className="downloads-actions">
        <button
          className="btn btn-primary"
          onClick={() => downloadAllAsZip(files)}
          type="button"
        >
          ⬇ Download all as .zip
        </button>
      </div>
    </div>
  );
};
