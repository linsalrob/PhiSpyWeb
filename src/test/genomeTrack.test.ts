import { describe, it, expect } from "vitest";
import { buildContigLayouts, coordToX } from "../lib/genomeTrack";

describe("buildContigLayouts", () => {
  it("groups coordinates by contig", () => {
    const coords = [
      { contig: "contig1", start: 100, stop: 500, prophage: "pp_1", raw: {} },
      { contig: "contig2", start: 200, stop: 800, prophage: "pp_2", raw: {} },
      { contig: "contig1", start: 1000, stop: 1500, prophage: "pp_3", raw: {} },
    ];
    const layouts = buildContigLayouts(coords);
    expect(layouts).toHaveLength(2);
    const c1 = layouts.find((l) => l.contig === "contig1");
    expect(c1?.prophages).toHaveLength(2);
  });

  it("handles missing contig as unknown", () => {
    const coords = [{ start: 0, stop: 100, raw: {} }];
    const layouts = buildContigLayouts(coords);
    expect(layouts[0].contig).toBe("unknown");
  });

  it("estimates contig length from max coordinate", () => {
    const coords = [{ contig: "c1", start: 0, stop: 50000, raw: {} }];
    const layouts = buildContigLayouts(coords);
    expect(layouts[0].length).toBeGreaterThanOrEqual(50000);
  });
});

describe("coordToX", () => {
  it("maps 0 to 0", () => {
    expect(coordToX(0, 1000, 800)).toBe(0);
  });

  it("maps full length to track width", () => {
    expect(coordToX(1000, 1000, 800)).toBe(800);
  });

  it("maps midpoint correctly", () => {
    expect(coordToX(500, 1000, 800)).toBe(400);
  });
});
