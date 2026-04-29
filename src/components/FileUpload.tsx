import React, { useRef, useState, useCallback } from "react";
import { formatBytes } from "../lib/downloadFiles";

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

const ACCEPTED = [".gb", ".gbk", ".gbff", ".txt"];
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  selectedFile,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  return (
    <div>
      <div
        className={`file-upload-area${dragOver ? " dragover" : ""}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        aria-label="Upload GenBank file"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={handleChange}
          disabled={disabled}
          aria-hidden="true"
        />
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📁</div>
        <div style={{ fontWeight: 500 }}>
          Drop a GenBank file here or click to browse
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--color-text-muted)",
            marginTop: "0.3rem",
          }}
        >
          Accepted formats: {ACCEPTED.join(", ")}
        </div>
      </div>

      {selectedFile && (
        <div className="file-info">
          <strong>📄 {selectedFile.name}</strong>{" "}
          <span style={{ color: "var(--color-text-muted)" }}>
            ({formatBytes(selectedFile.size)})
          </span>
        </div>
      )}

      {selectedFile && selectedFile.size > LARGE_FILE_THRESHOLD && (
        <div className="file-warning">
          ⚠️ Large file ({formatBytes(selectedFile.size)}). Processing may be
          slow in the browser.
        </div>
      )}
    </div>
  );
};
