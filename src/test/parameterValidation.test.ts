import { describe, it, expect } from "vitest";
import { defaultParams } from "../lib/phispyTypes";

describe("defaultParams", () => {
  it("has valid default values", () => {
    expect(defaultParams.phageGenes).toBeGreaterThan(0);
    expect(defaultParams.windowSize).toBeGreaterThan(0);
    expect(defaultParams.minContigSize).toBeGreaterThan(0);
    expect(defaultParams.outputChoice).toBeGreaterThan(0);
  });

  it("phageGenes default is 1", () => {
    expect(defaultParams.phageGenes).toBe(1);
  });

  it("windowSize default is 30", () => {
    expect(defaultParams.windowSize).toBe(30);
  });

  it("minContigSize default is 5000", () => {
    expect(defaultParams.minContigSize).toBe(5000);
  });

  it("outputChoice default is 512", () => {
    expect(defaultParams.outputChoice).toBe(512);
  });
});
