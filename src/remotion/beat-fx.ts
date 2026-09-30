/** Pure helpers for beat-synced effects, shared by components (and unit-testable). */

/** Most recent value <= frame in an ascending list, or undefined. */
export function lastAtOrBefore(sorted: readonly number[], frame: number): number | undefined {
  let lo = 0;
  let hi = sorted.length - 1;
  let found: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid]!;
    if (v <= frame) {
      found = v;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Exponentially decaying pulse in [0, 1] triggered at each frame in `triggers`. */
export function pulse(triggers: readonly number[], frame: number, decayFrames: number): number {
  const last = lastAtOrBefore(triggers, frame);
  if (last === undefined || decayFrames <= 0) return 0;
  return Math.exp(-(frame - last) / decayFrames);
}

/** Linear flash opacity for `length` frames after a trigger. */
export function flash(triggers: readonly number[], frame: number, length: number): number {
  const last = lastAtOrBefore(triggers, frame);
  if (last === undefined || length <= 0) return 0;
  const since = frame - last;
  return since < length ? 1 - since / length : 0;
}
