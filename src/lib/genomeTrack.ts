import type { ProphageCoordinate } from "./phispyTypes";

export interface ContigLayout {
  contig: string;
  length: number;
  prophages: Array<{ id: string; start: number; stop: number }>;
}

/** Per-record entry returned by the GenBank parser */
interface ContigRecord {
  /** Primary identifier (LOCUS name) */
  name: string;
  length: number;
  /** All alternate IDs that refer to the same record (ACCESSION, VERSION) */
  aliases: string[];
}

/** Parsed contig length information from a GenBank file */
export interface ParsedContigLengths {
  /** Lookup map: maps every possible contig ID (locus, accession, version) to its length */
  byId: Map<string, number>;
  /** Canonical ordered list of contigs (one per GenBank LOCUS record, in file order) */
  canonical: ReadonlyArray<Readonly<ContigRecord>>;
}

/**
 * Parse contig lengths from the text of a GenBank file.
 * Returns both a lookup map (all possible IDs → length) and a canonical ordered
 * list of unique contigs for building the genome track.
 */
export function parseContigLengthsFromGenBank(genbankText: string): ParsedContigLengths {
  const byId = new Map<string, number>();
  const canonical: ContigRecord[] = [];

  // Split on the start of each LOCUS record
  const records = genbankText.split(/^(?=LOCUS\s)/m).filter((r) => r.trim().length > 0);

  for (const record of records) {
    const locusMatch = record.match(/^LOCUS\s+(\S+)\s+(\d+)\s+bp/m);
    if (!locusMatch) continue;

    const locusName = locusMatch[1];
    const length = parseInt(locusMatch[2], 10);
    if (isNaN(length) || length <= 0) continue;

    byId.set(locusName, length);
    const aliases: string[] = [];

    // VERSION line is BioPython's primary record.id (e.g. "NZ_CP012345.1")
    const verMatch = record.match(/^VERSION\s+(\S+)/m);
    if (verMatch?.[1] && verMatch[1] !== locusName) {
      byId.set(verMatch[1], length);
      aliases.push(verMatch[1]);
    }

    // ACCESSION line (bare accession, without .version suffix)
    const accMatch = record.match(/^ACCESSION\s+(\S+)/m);
    if (
      accMatch?.[1] &&
      accMatch[1] !== locusName &&
      accMatch[1] !== verMatch?.[1]
    ) {
      byId.set(accMatch[1], length);
      aliases.push(accMatch[1]);
    }

    canonical.push({ name: locusName, length, aliases });
  }

  return { byId, canonical };
}

export function buildContigLayouts(
  coordinates: ProphageCoordinate[],
  parsedLengths?: ParsedContigLengths
): ContigLayout[] {
  const map = new Map<string, ContigLayout>();

  // Build a fast lookup: any known ID → canonical record name
  const aliasToCanonical = new Map<string, string>();
  if (parsedLengths) {
    for (const record of parsedLengths.canonical) {
      aliasToCanonical.set(record.name, record.name);
      for (const alias of record.aliases) {
        aliasToCanonical.set(alias, record.name);
      }
    }
  }

  for (const coord of coordinates) {
    const rawContig = coord.contig ?? "unknown";
    // Resolve to the canonical LOCUS name when GenBank data is available so that
    // prophages always land on the same row as the GenBank contig, regardless of
    // which ID format (LOCUS, ACCESSION, VERSION) PhiSpy used in its output.
    const contig =
      rawContig !== "unknown"
        ? (aliasToCanonical.get(rawContig) ?? rawContig)
        : "unknown";
    const start = coord.start ?? 0;
    const stop = coord.stop ?? 0;

    if (!map.has(contig)) {
      // byId contains every known ID (LOCUS, ACCESSION, VERSION), so rawContig
      // is always the right key regardless of whether normalization occurred.
      const knownLength = parsedLengths?.byId.get(rawContig) ?? 0;
      map.set(contig, { contig, length: knownLength, prophages: [] });
    }

    const layout = map.get(contig)!;
    layout.prophages.push({
      id: coord.prophage ?? `prophage_${layout.prophages.length + 1}`,
      start,
      stop,
    });
    // Only estimate length from coordinates when no real length was provided.
    // byId contains all known IDs, so rawContig is the right key to check.
    if (!parsedLengths?.byId.has(rawContig)) {
      layout.length = Math.max(layout.length, stop, start);
    }
  }

  // Add contigs from GenBank that have no prophages.
  if (parsedLengths) {
    for (const record of parsedLengths.canonical) {
      if (!map.has(record.name)) {
        map.set(record.name, { contig: record.name, length: record.length, prophages: [] });
      }
    }
  }

  // Sort by length descending (longest contig first)
  const layouts = Array.from(map.values());
  layouts.sort((a, b) => b.length - a.length);

  return layouts;
}

export function coordToX(
  position: number,
  contigLength: number,
  trackWidth: number
): number {
  if (contigLength === 0) return 0;
  return Math.round((position / contigLength) * trackWidth);
}
