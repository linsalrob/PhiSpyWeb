import type { ProphageCoordinate, PhiSpyOutputFile } from "./phispyTypes";

export function parseProphageCoordinates(content: string): ProphageCoordinate[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const results: ProphageCoordinate[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split("\t");
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx]?.trim() ?? "";
    });

    const prophage = findField(raw, ["prophage_id", "prophage", "id", "name"]);
    const contig = findField(raw, ["contig_id", "contig", "accno", "sequence", "accession"]);
    const startRaw = findField(raw, ["start", "start_position", "begin"]);
    const stopRaw = findField(raw, ["stop", "end", "end_position", "stop_position"]);
    const start = startRaw !== undefined ? parseInt(startRaw, 10) : undefined;
    const stop = stopRaw !== undefined ? parseInt(stopRaw, 10) : undefined;
    const length =
      start !== undefined && stop !== undefined && !isNaN(start) && !isNaN(stop)
        ? Math.abs(stop - start)
        : undefined;

    results.push({ prophage, contig, start, stop, length, raw });
  }

  return results;
}

export function mimeTypeForFile(filename: string): string {
  if (filename.endsWith(".tsv")) return "text/tab-separated-values";
  if (filename.endsWith(".csv")) return "text/csv";
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".bed")) return "text/plain";
  if (
    filename.endsWith(".fasta") ||
    filename.endsWith(".fa") ||
    filename.endsWith(".ffn") ||
    filename.endsWith(".fna")
  )
    return "text/plain";
  if (
    filename.endsWith(".gb") ||
    filename.endsWith(".gbk") ||
    filename.endsWith(".gbff")
  )
    return "text/plain";
  return "text/plain";
}

export function findCoordinatesFile(
  files: PhiSpyOutputFile[]
): PhiSpyOutputFile | undefined {
  return files.find(
    (f) =>
      f.filename.includes("prophage_coordinates") ||
      f.filename.includes("coordinates")
  );
}

function findField(
  raw: Record<string, string>,
  candidates: string[]
): string | undefined {
  for (const key of candidates) {
    if (key in raw && raw[key] !== "") return raw[key];
  }
  return undefined;
}
