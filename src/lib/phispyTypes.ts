export interface ProphageCoordinate {
  prophage?: string;
  contig?: string;
  start?: number;
  stop?: number;
  length?: number;
  raw: Record<string, string>;
}

export interface PhiSpyOutputFile {
  filename: string;
  content: string;
  mimeType: string;
}

export interface PhiSpyRunSummary {
  inputFilename: string;
  prophageCount: number;
  outputFileCount: number;
}

export interface PhiSpyRunResult {
  summary: PhiSpyRunSummary;
  coordinates: ProphageCoordinate[];
  files: PhiSpyOutputFile[];
  stdout: string[];
  stderr: string[];
}

export interface PhiSpyRunParameters {
  phageGenes: number;
  windowSize: number;
  minContigSize: number;
  outputChoice: number;
  trainingSet: string;
}

export type PhiSpyTrainingSetOption = {
  value: string;
  label: string;
  count?: number;
  genomeFile: string;
};

export type TrainingSetManifest = {
  phispyVersion: string;
  schemaVersion: number;
  trainingSets: PhiSpyTrainingSetOption[];
};

export type RunState =
  | "idle"
  | "loading"
  | "installing"
  | "running"
  | "parsing"
  | "complete"
  | "error";

export const defaultParams: PhiSpyRunParameters = {
  phageGenes: 1,
  windowSize: 30,
  minContigSize: 5000,
  outputChoice: 512,
  trainingSet: "",
};
