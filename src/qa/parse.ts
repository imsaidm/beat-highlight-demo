/** Pure parsers for ffmpeg filter logs (unit-tested against captured output). */

export interface BlackSegment {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export function parseBlackdetect(stderr: string): BlackSegment[] {
  const re = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g;
  return [...stderr.matchAll(re)].map((m) => ({
    start: Number(m[1]),
    end: Number(m[2]),
    duration: Number(m[3]),
  }));
}

export interface Loudness {
  readonly integrated: number;
  readonly lra: number;
  readonly truePeak: number;
}

/** Parses the final "Summary:" block of the ebur128 filter (run with peak=true). */
export function parseEbur128(stderr: string): Loudness {
  const idx = stderr.lastIndexOf("Summary:");
  if (idx < 0) throw new Error("ebur128 output has no Summary block");
  const summary = stderr.slice(idx);
  const num = (re: RegExp, label: string): number => {
    const m = summary.match(re);
    if (!m) throw new Error(`ebur128 summary is missing ${label}`);
    const v = Number(m[1]);
    return m[1] === "-inf" ? -Infinity : v;
  };
  return {
    integrated: num(/I:\s*(-?[\d.]+|-inf)\s*LUFS/, "integrated loudness"),
    lra: num(/LRA:\s*(-?[\d.]+|-inf)\s*LU/, "loudness range"),
    truePeak: num(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/, "true peak"),
  };
}
