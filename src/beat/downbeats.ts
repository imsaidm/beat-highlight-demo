import type { Drop } from "./energy.js";

export const BEATS_PER_BAR = 4;

/**
 * Chooses which beat (mod 4) starts a bar. A strong drop is by convention a
 * bar start, so it wins; otherwise the phase with the most low-band (kick)
 * accent energy is used.
 */
export function chooseDownbeatPhase(lowAccents: readonly number[], strongestDrop: Drop | undefined): number {
  if (strongestDrop) return strongestDrop.beatIndex % BEATS_PER_BAR;
  const sums = Array.from({ length: BEATS_PER_BAR }, (_, phase) =>
    lowAccents.reduce((acc, v, i) => (i % BEATS_PER_BAR === phase ? acc + v : acc), 0),
  );
  return sums.indexOf(Math.max(...sums));
}

export function downbeatIndices(beatCount: number, phase: number): number[] {
  const out: number[] = [];
  for (let i = phase; i < beatCount; i += BEATS_PER_BAR) out.push(i);
  return out;
}

/** Moves each drop to the nearest downbeat and removes duplicates (keeps the strongest). */
export function snapDropsToDownbeats(drops: readonly Drop[], beats: readonly number[], phase: number): Drop[] {
  const seen = new Set<number>();
  return drops.flatMap((d) => {
    const rel = d.beatIndex - phase;
    const snapped = phase + Math.round(rel / BEATS_PER_BAR) * BEATS_PER_BAR;
    const idx = snapped >= beats.length ? snapped - BEATS_PER_BAR : Math.max(phase, snapped);
    const time = beats[idx];
    if (time === undefined || seen.has(idx)) return [];
    seen.add(idx);
    return [{ ...d, beatIndex: idx, time }];
  });
}
