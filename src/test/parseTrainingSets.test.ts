import { describe, it, expect } from "vitest";
import {
  formatTrainingSetLabel,
  parseTrainingSetList,
  FALLBACK_TRAINING_SETS,
} from "../lib/parseTrainingSets";

describe("formatTrainingSetLabel", () => {
  it("removes .gb.gz suffix", () => {
    expect(formatTrainingSetLabel("Escherichia_coli_O157-H7_EDL933.gb.gz")).toBe(
      "Escherichia coli O157-H7 EDL933"
    );
  });

  it("replaces underscores with spaces", () => {
    expect(formatTrainingSetLabel("Bacillus_halodurans_C-125.gb.gz")).toBe(
      "Bacillus halodurans C-125"
    );
  });

  it("is case-insensitive for suffix removal", () => {
    expect(formatTrainingSetLabel("Test_genome.GB.GZ")).toBe("Test genome");
  });

  it("handles a label with no suffix", () => {
    expect(formatTrainingSetLabel("Mycobacterium tuberculosis CDC1551")).toBe(
      "Mycobacterium tuberculosis CDC1551"
    );
  });
});

describe("parseTrainingSetList", () => {
  it("parses a single tab-separated line", () => {
    const input = `data/trainSet_Ecoli.txt\t4\tEscherichia_coli_O157-H7_EDL933.gb.gz`;
    expect(parseTrainingSetList(input)).toEqual([
      {
        value: "data/trainSet_Ecoli.txt",
        count: 4,
        genomeFile: "Escherichia_coli_O157-H7_EDL933.gb.gz",
        label: "Escherichia coli O157-H7 EDL933",
      },
    ]);
  });

  it("parses multiple lines and sorts by label case-insensitively", () => {
    const input = [
      "data/trainSet_Ecoli.txt\t4\tEscherichia_coli_O157-H7_EDL933.gb.gz",
      "data/trainSet_Bacillus.txt\t2\tBacillus_halodurans_C-125.gb.gz",
      "data/trainSet_aardvark.txt\t1\taardvark_genome.gb.gz",
    ].join("\n");
    const result = parseTrainingSetList(input);
    expect(result.map((o) => o.label)).toEqual([
      "aardvark genome",
      "Bacillus halodurans C-125",
      "Escherichia coli O157-H7 EDL933",
    ]);
  });

  it("tolerates spaces instead of tabs between columns", () => {
    const input = `data/trainSet_Ecoli.txt   4   Escherichia_coli_O157-H7_EDL933.gb.gz`;
    const result = parseTrainingSetList(input);
    expect(result[0].value).toBe("data/trainSet_Ecoli.txt");
    expect(result[0].count).toBe(4);
    expect(result[0].genomeFile).toBe("Escherichia_coli_O157-H7_EDL933.gb.gz");
  });

  it("ignores empty lines", () => {
    const input = `\ndata/trainSet_Ecoli.txt\t4\tEscherichia_coli_O157-H7_EDL933.gb.gz\n\n`;
    expect(parseTrainingSetList(input)).toHaveLength(1);
  });

  it("throws on a line with fewer than 3 columns", () => {
    const input = `data/trainSet_Ecoli.txt\t4`;
    expect(() => parseTrainingSetList(input)).toThrow(
      "Invalid PhiSpy training set line"
    );
  });

  it("dropdown value uses the first column, not the label", () => {
    const input = `data/trainSet_Ecoli.txt\t4\tEscherichia_coli_O157-H7_EDL933.gb.gz`;
    const result = parseTrainingSetList(input);
    expect(result[0].value).toBe("data/trainSet_Ecoli.txt");
    expect(result[0].value).not.toBe(result[0].label);
  });
});

describe("FALLBACK_TRAINING_SETS", () => {
  it("is sorted alphabetically case-insensitively by label", () => {
    const labels = FALLBACK_TRAINING_SETS.map((o) => o.label);
    const sorted = [...labels].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    expect(labels).toEqual(sorted);
  });
});

describe("default training set selection", () => {
  it("prefers data/trainSet_Ecoli.txt when present in options", () => {
    const preferredDefault = "data/trainSet_Ecoli.txt";
    const options = FALLBACK_TRAINING_SETS;
    const defaultTrainingSet =
      options.find((o) => o.value === preferredDefault)?.value ??
      options[0]?.value ??
      "";
    expect(defaultTrainingSet).toBe("data/trainSet_Ecoli.txt");
  });

  it("falls back to the first option when Ecoli is not present", () => {
    const preferredDefault = "data/trainSet_Ecoli.txt";
    const options = FALLBACK_TRAINING_SETS.filter(
      (o) => o.value !== preferredDefault
    );
    const defaultTrainingSet =
      options.find((o) => o.value === preferredDefault)?.value ??
      options[0]?.value ??
      "";
    expect(defaultTrainingSet).toBe(options[0].value);
  });
});
