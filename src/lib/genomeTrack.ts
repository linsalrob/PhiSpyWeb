import type { ProphageCoordinate } from "./phispyTypes";

export interface ContigLayout {
  contig: string;
  length: number;
  prophages: Array<{ id: string; start: number; stop: number }>;
}

export function buildContigLayouts(
  coordinates: ProphageCoordinate[]
): ContigLayout[] {
  const map = new Map<string, ContigLayout>();

  for (const coord of coordinates) {
    const contig = coord.contig ?? "unknown";
    const start = coord.start ?? 0;
    const stop = coord.stop ?? 0;

    if (!map.has(contig)) {
      map.set(contig, { contig, length: 0, prophages: [] });
    }

    const layout = map.get(contig)!;
    layout.prophages.push({
      id: coord.prophage ?? `prophage_${layout.prophages.length + 1}`,
      start,
      stop,
    });
    layout.length = Math.max(layout.length, stop, start);
  }

  return Array.from(map.values());
}

export function coordToX(
  position: number,
  contigLength: number,
  trackWidth: number
): number {
  if (contigLength === 0) return 0;
  return Math.round((position / contigLength) * trackWidth);
}
