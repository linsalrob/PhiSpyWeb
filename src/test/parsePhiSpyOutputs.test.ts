import { describe, it, expect } from "vitest";
import {
  parseProphageCoordinates,
  mimeTypeForFile,
  findCoordinatesFile,
} from "../lib/parsePhiSpyOutputs";

describe("parseProphageCoordinates", () => {
  it("parses a standard prophage_coordinates.tsv", () => {
    const tsv = `prophage_id\tcontig_id\tstart\tstop
pp_1\tNC_000913\t100000\t130000
pp_2\tNC_000913\t200000\t240000
`;
    const result = parseProphageCoordinates(tsv);
    expect(result).toHaveLength(2);
    expect(result[0].prophage).toBe("pp_1");
    expect(result[0].contig).toBe("NC_000913");
    expect(result[0].start).toBe(100000);
    expect(result[0].stop).toBe(130000);
    expect(result[0].length).toBe(30000);
  });

  it("handles missing optional columns gracefully", () => {
    const tsv = `id\tstart\tstop
region_1\t1000\t5000
`;
    const result = parseProphageCoordinates(tsv);
    expect(result).toHaveLength(1);
    expect(result[0].prophage).toBe("region_1");
    expect(result[0].contig).toBeUndefined();
  });

  it("returns empty array for header-only input", () => {
    const tsv = `prophage_id\tcontig_id\tstart\tstop\n`;
    expect(parseProphageCoordinates(tsv)).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseProphageCoordinates("")).toHaveLength(0);
  });

  it("preserves raw columns", () => {
    const tsv = `prophage_id\tcontig_id\tstart\tstop\tscore\npp_1\tNC_1\t100\t200\t0.95\n`;
    const result = parseProphageCoordinates(tsv);
    expect(result[0].raw["score"]).toBe("0.95");
  });

  it("handles alternative column names", () => {
    const tsv = `name\taccno\tbegin\tend
phage1\tcontig1\t500\t1500
`;
    const result = parseProphageCoordinates(tsv);
    expect(result[0].prophage).toBe("phage1");
    expect(result[0].contig).toBe("contig1");
    expect(result[0].start).toBe(500);
    expect(result[0].stop).toBe(1500);
  });
});

describe("mimeTypeForFile", () => {
  it("returns correct MIME for tsv", () => {
    expect(mimeTypeForFile("results.tsv")).toBe("text/tab-separated-values");
  });

  it("returns text/plain for unknown", () => {
    expect(mimeTypeForFile("file.xyz")).toBe("text/plain");
  });

  it("returns text/plain for genbank formats", () => {
    expect(mimeTypeForFile("genome.gb")).toBe("text/plain");
    expect(mimeTypeForFile("genome.gbk")).toBe("text/plain");
  });
});

describe("findCoordinatesFile", () => {
  it("finds prophage_coordinates.tsv", () => {
    const files = [
      { filename: "prophage_coordinates.tsv", content: "", mimeType: "text/tab-separated-values" },
      { filename: "other.tsv", content: "", mimeType: "text/tab-separated-values" },
    ];
    expect(findCoordinatesFile(files)?.filename).toBe("prophage_coordinates.tsv");
  });

  it("returns undefined when no coordinates file", () => {
    const files = [{ filename: "results.tsv", content: "", mimeType: "text/plain" }];
    expect(findCoordinatesFile(files)).toBeUndefined();
  });
});
