import { describe, it, expect } from "vitest";
import { formatBytes, sanitiseFilename } from "../lib/downloadFiles";

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1500)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("sanitiseFilename", () => {
  it("replaces invalid characters", () => {
    expect(sanitiseFilename("file name (1).tsv")).toBe("file_name__1_.tsv");
  });

  it("allows valid characters", () => {
    expect(sanitiseFilename("results_2024.tsv")).toBe("results_2024.tsv");
  });
});
