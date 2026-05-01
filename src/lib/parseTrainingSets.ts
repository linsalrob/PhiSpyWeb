import type { PhiSpyTrainingSetOption, TrainingSetManifest } from "./phispyTypes";

export function formatTrainingSetLabel(genomeFile: string): string {
  return genomeFile
    .replace(/\.gb\.gz$/i, "")
    .replace(/_/g, " ");
}

export function parseTrainingSetList(text: string): PhiSpyTrainingSetOption[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);

      if (parts.length < 3) {
        throw new Error(`Invalid PhiSpy training set line: ${line}`);
      }

      const [value, countText, genomeFile] = parts;

      return {
        value,
        label: formatTrainingSetLabel(genomeFile),
        count: Number.parseInt(countText, 10),
        genomeFile,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function parseTrainingSetManifest(json: unknown): TrainingSetManifest {
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as Record<string, unknown>).phispyVersion !== "string" ||
    typeof (json as Record<string, unknown>).schemaVersion !== "number" ||
    !Array.isArray((json as Record<string, unknown>).trainingSets)
  ) {
    throw new Error("Invalid training-sets.json: missing required fields");
  }

  const raw = json as {
    phispyVersion: string;
    schemaVersion: number;
    trainingSets: unknown[];
  };

  const trainingSets: PhiSpyTrainingSetOption[] = raw.trainingSets.map(
    (item, i) => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as Record<string, unknown>).value !== "string" ||
        typeof (item as Record<string, unknown>).label !== "string"
      ) {
        throw new Error(
          `Invalid training-sets.json: trainingSets[${i}] is missing value or label`
        );
      }
      const entry = item as Record<string, unknown>;
      return {
        value: entry.value as string,
        label: entry.label as string,
        count:
          typeof entry.count === "number" ? entry.count : undefined,
        genomeFile:
          typeof entry.genomeFile === "string" ? entry.genomeFile : "",
      };
    }
  );

  return {
    phispyVersion: raw.phispyVersion,
    schemaVersion: raw.schemaVersion,
    trainingSets,
  };
}

export const FALLBACK_TRAINING_SETS: PhiSpyTrainingSetOption[] = ([
  { value: "data/trainSet_Bacillus.txt", count: 2, genomeFile: "Bacillus_halodurans_C-125.gb.gz", label: "Bacillus halodurans C-125" },
  { value: "data/trainSet_Clostridium.txt", count: 2, genomeFile: "Clostridium_perfringens_str._13.gb.gz", label: "Clostridium perfringens str. 13" },
  { value: "data/trainSet_Ecoli.txt", count: 4, genomeFile: "Escherichia_coli_O157-H7_EDL933.gb.gz", label: "Escherichia coli O157-H7 EDL933" },
  { value: "data/trainSet_Efec.txt", count: 1, genomeFile: "Enterococcus_faecalis_strain_V583.gb.gz", label: "Enterococcus faecalis strain V583" },
  { value: "data/trainSet_Listeria.txt", count: 2, genomeFile: "Listeria_monocytogenes_EGD-e.gb.gz", label: "Listeria monocytogenes EGD-e" },
  { value: "data/trainSet_Mtb.txt", count: 2, genomeFile: "Mycobacterium tuberculosis CDC1551", label: "Mycobacterium tuberculosis CDC1551" },
  { value: "data/trainSet_Nmeningitidis.txt", count: 2, genomeFile: "Neisseria_meningitidis_Z2491.gb.gz", label: "Neisseria meningitidis Z2491" },
  { value: "data/trainSet_Paracoccus.txt", count: 5, genomeFile: "Paracoccus_aminophilus_JCM_7686.gb.gz", label: "Paracoccus aminophilus JCM 7686" },
  { value: "data/trainSet_Pseudomonas.txt", count: 2, genomeFile: "Pseudomonas_aeruginosa_PAO1.gb.gz", label: "Pseudomonas aeruginosa PAO1" },
  { value: "data/trainSet_Saureus.txt", count: 3, genomeFile: "Staphylococcus_aureus_strain_Sa_Newman_UoM.gb.gz", label: "Staphylococcus aureus strain Sa Newman UoM" },
  { value: "data/trainSet_Spyogenes.txt", count: 3, genomeFile: "Streptococcus_pyogenes_MGAS315.gb.gz", label: "Streptococcus pyogenes MGAS315" },
  { value: "data/trainSet_Xfastidiosa.txt", count: 2, genomeFile: "Xylella_fastidiosa_Temecula1.gb.gz", label: "Xylella fastidiosa Temecula1" },
  { value: "data/trainSet_Ypestis.txt", count: 2, genomeFile: "Yersinia_pestis_CO92.gb.gz", label: "Yersinia pestis CO92" },
] as PhiSpyTrainingSetOption[]).sort((a, b) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
);
