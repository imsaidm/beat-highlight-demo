/** Prefix sums of squared samples, for O(1) windowed power queries. */
export function powerPrefix(pcm: Float32Array): Float64Array {
  const prefix = new Float64Array(pcm.length + 1);
  for (let i = 0; i < pcm.length; i++) prefix[i + 1] = prefix[i]! + pcm[i]! * pcm[i]!;
  return prefix;
}

/** Mean power of samples in [start, end) (clamped). Returns 0 for empty windows. */
export function windowPower(prefix: Float64Array, start: number, end: number): number {
  const a = Math.max(0, Math.min(prefix.length - 1, Math.floor(start)));
  const b = Math.max(0, Math.min(prefix.length - 1, Math.floor(end)));
  return b > a ? (prefix[b]! - prefix[a]!) / (b - a) : 0;
}

/** RMS energy curve sampled every `hopSec`, normalised to [0, 1]. */
export function energyCurve(pcm: Float32Array, sampleRate: number, hopSec = 0.25): number[] {
  const prefix = powerPrefix(pcm);
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const rms: number[] = [];
  for (let s = 0; s < pcm.length; s += hop) rms.push(Math.sqrt(windowPower(prefix, s, s + hop)));
  const max = Math.max(...rms, 1e-12);
  return rms.map((v) => Number((v / max).toFixed(4)));
}

export interface DropOptions {
  /** Length (in beats) of the before/after comparison windows. */
  readonly windowBeats: number;
  /** Minimum loudness jump (dB) for a drop candidate. */
  readonly minDb: number;
  readonly minSeparationBeats: number;
  readonly maxDrops: number;
}

export const DEFAULT_DROP_OPTIONS: DropOptions = Object.freeze({ windowBeats: 8, minDb: 3, minSeparationBeats: 16, maxDrops: 4 });

export interface Drop {
  readonly time: number;
  readonly beatIndex: number;
  readonly strength: number;
}

/**
 * A "drop" is a beat where the following window is markedly louder than the
 * preceding one AND loud in absolute terms. Strength = dB jump * sqrt(relative loudness).
 */
export function detectDrops(
  pcm: Float32Array,
  sampleRate: number,
  beats: readonly number[],
  periodSec: number,
  opts: DropOptions = DEFAULT_DROP_OPTIONS,
): Drop[] {
  const prefix = powerPrefix(pcm);
  const w = opts.windowBeats * periodSec * sampleRate;
  const measured = beats.map((t, beatIndex) => {
    const s = t * sampleRate;
    const before = windowPower(prefix, s - w, s);
    const after = windowPower(prefix, s, s + w);
    const valid = s - w >= -w / 2 && s + w / 2 <= pcm.length && before > 0;
    return { time: t, beatIndex, after, db: valid ? 10 * Math.log10(after / before) : 0 };
  });
  const maxAfter = Math.max(...measured.map((m) => m.after), 1e-12);
  const scored = measured.map((m) => ({ ...m, strength: m.db * Math.sqrt(m.after / maxAfter) }));
  const candidates = scored.filter((m, i) => {
    if (m.db < opts.minDb) return false;
    const neighbours = scored.slice(Math.max(0, i - 4), i + 5);
    return neighbours.every((n) => n.strength <= m.strength);
  });

  const picked = [...candidates]
    .sort((a, b) => b.strength - a.strength || a.time - b.time)
    .reduce<Drop[]>((acc, c) => {
      const tooClose = acc.some((d) => Math.abs(d.beatIndex - c.beatIndex) < opts.minSeparationBeats);
      return tooClose || acc.length >= opts.maxDrops
        ? acc
        : [...acc, { time: c.time, beatIndex: c.beatIndex, strength: Number(c.strength.toFixed(3)) }];
    }, []);
  return picked;
}
