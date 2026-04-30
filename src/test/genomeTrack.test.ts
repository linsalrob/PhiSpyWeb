import { describe, it, expect } from "vitest";
import { buildContigLayouts, coordToX, parseContigLengthsFromGenBank } from "../lib/genomeTrack";

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

  it("sorts contigs by length descending", () => {
    const coords = [
      { contig: "short", start: 0, stop: 1000, raw: {} },
      { contig: "long", start: 0, stop: 10000, raw: {} },
      { contig: "medium", start: 0, stop: 5000, raw: {} },
    ];
    const layouts = buildContigLayouts(coords);
    expect(layouts[0].contig).toBe("long");
    expect(layouts[1].contig).toBe("medium");
    expect(layouts[2].contig).toBe("short");
  });

  it("uses provided contig lengths when available", () => {
    const coords = [
      { contig: "c1", start: 0, stop: 1000, raw: {} },
    ];
    const parsedLengths = {
      byId: new Map([["c1", 50000]]),
      canonical: [{ name: "c1", length: 50000, aliases: [] }],
    };
    const layouts = buildContigLayouts(coords, parsedLengths);
    expect(layouts[0].length).toBe(50000);
  });

  it("includes contigs from GenBank that have no prophages", () => {
    const coords = [{ contig: "c1", start: 0, stop: 1000, raw: {} }];
    const parsedLengths = {
      byId: new Map([["c1", 10000], ["c2", 8000]]),
      canonical: [
        { name: "c1", length: 10000, aliases: [] },
        { name: "c2", length: 8000, aliases: [] },
      ],
    };
    const layouts = buildContigLayouts(coords, parsedLengths);
    expect(layouts).toHaveLength(2);
    const c2 = layouts.find((l) => l.contig === "c2");
    expect(c2).toBeDefined();
    expect(c2?.prophages).toHaveLength(0);
  });

  it("does not duplicate a contig that coordinates reference under an alias", () => {
    const coords = [{ contig: "NZ_CP012345.1", start: 0, stop: 1000, raw: {} }];
    const parsedLengths = {
      byId: new Map([["MyLocus", 10000], ["NZ_CP012345.1", 10000]]),
      canonical: [{ name: "MyLocus", length: 10000, aliases: ["NZ_CP012345.1"] }],
    };
    const layouts = buildContigLayouts(coords, parsedLengths);
    // The canonical LOCUS "MyLocus" should NOT be added separately since
    // its alias "NZ_CP012345.1" is already in the map
    expect(layouts).toHaveLength(1);
  });

  it("normalises alias IDs to canonical LOCUS name", () => {
    // PhiSpy uses the BioPython record.id (VERSION) as the contig identifier.
    // buildContigLayouts should map that alias to the canonical LOCUS name so
    // the prophage appears on the correct row and the label matches the GBFF file.
    const coords = [{ contig: "NZ_CP012345.1", start: 5000, stop: 10000, raw: {} }];
    const parsedLengths = {
      byId: new Map([["MyLocus", 100000], ["NZ_CP012345.1", 100000]]),
      canonical: [{ name: "MyLocus", length: 100000, aliases: ["NZ_CP012345.1"] }],
    };
    const layouts = buildContigLayouts(coords, parsedLengths);
    expect(layouts).toHaveLength(1);
    expect(layouts[0].contig).toBe("MyLocus");
    expect(layouts[0].prophages).toHaveLength(1);
    expect(layouts[0].prophages[0].start).toBe(5000);
  });

  it("places prophages on the correct contig when contig IDs use VERSION format", () => {
    // Two contigs: one with a prophage (VERSION alias), one without
    const coords = [{ contig: "CP001.1", start: 1000, stop: 2000, raw: {} }];
    const parsedLengths = {
      byId: new Map([
        ["Locus1", 50000], ["CP001.1", 50000],
        ["Locus2", 30000], ["CP002.1", 30000],
      ]),
      canonical: [
        { name: "Locus1", length: 50000, aliases: ["CP001.1"] },
        { name: "Locus2", length: 30000, aliases: ["CP002.1"] },
      ],
    };
    const layouts = buildContigLayouts(coords, parsedLengths);
    expect(layouts).toHaveLength(2);
    const locus1 = layouts.find((l) => l.contig === "Locus1");
    const locus2 = layouts.find((l) => l.contig === "Locus2");
    expect(locus1).toBeDefined();
    expect(locus2).toBeDefined();
    expect(locus1?.prophages).toHaveLength(1);
    expect(locus2?.prophages).toHaveLength(0);
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

describe("parseContigLengthsFromGenBank", () => {
  const minimalGenBank = [
    "LOCUS       MyContig1          10000 bp    DNA     linear   BCT 01-JAN-2020",
    "ACCESSION   NC_000001",
    "VERSION     NC_000001.1",
    "ORIGIN",
    "//",
    "LOCUS       MyContig2           5000 bp    DNA     linear   BCT 01-JAN-2020",
    "ACCESSION   NC_000002",
    "VERSION     NC_000002.1",
    "ORIGIN",
    "//",
  ].join("\n");

  it("parses LOCUS lengths", () => {
    const result = parseContigLengthsFromGenBank(minimalGenBank);
    expect(result.byId.get("MyContig1")).toBe(10000);
    expect(result.byId.get("MyContig2")).toBe(5000);
  });

  it("maps VERSION aliases", () => {
    const result = parseContigLengthsFromGenBank(minimalGenBank);
    expect(result.byId.get("NC_000001.1")).toBe(10000);
    expect(result.byId.get("NC_000002.1")).toBe(5000);
  });

  it("maps ACCESSION aliases", () => {
    const result = parseContigLengthsFromGenBank(minimalGenBank);
    expect(result.byId.get("NC_000001")).toBe(10000);
  });

  it("returns canonical list in file order with correct lengths", () => {
    const result = parseContigLengthsFromGenBank(minimalGenBank);
    expect(result.canonical).toHaveLength(2);
    expect(result.canonical[0].name).toBe("MyContig1");
    expect(result.canonical[0].length).toBe(10000);
    expect(result.canonical[1].name).toBe("MyContig2");
    expect(result.canonical[1].length).toBe(5000);
  });

  it("includes VERSION in aliases", () => {
    const result = parseContigLengthsFromGenBank(minimalGenBank);
    expect(result.canonical[0].aliases).toContain("NC_000001.1");
  });

  it("returns empty result for non-GenBank text", () => {
    const result = parseContigLengthsFromGenBank("not a genbank file");
    expect(result.byId.size).toBe(0);
    expect(result.canonical).toHaveLength(0);
  });
});
