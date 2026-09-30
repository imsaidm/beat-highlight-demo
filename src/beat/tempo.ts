export interface TempoOptions {
  readonly minBpm: number;
  readonly maxBpm: number;
  /** Centre of the log-normal tempo prior (librosa's default is 120 BPM, 1 octave std). */
  readonly priorBpm: number;
  readonly priorOctaves: number;
}

export const DEFAULT_TEMPO_OPTIONS: TempoOptions = Object.freeze({ minBpm: 60, maxBpm: 200, priorBpm: 120, priorOctaves: 1 });

export interface TempoEstimate {
  readonly bpm: number;
  readonly periodFrames: number;
  readonly confidence: number;
}

/** Tempo from the autocorrelation of the onset envelope, weighted by a log-normal prior. */
export function estimateTempo(env: Float32Array, frameRate: number, opts: TempoOptions = DEFAULT_TEMPO_OPTIONS): TempoEstimate {
  const n = env.length;
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const x = env.map((v) => v - mean);
  const minLag = Math.max(1, Math.floor((60 * frameRate) / opts.maxBpm));
  const maxLag = Math.min(n - 2, Math.ceil((60 * frameRate) / opts.minBpm));
  if (maxLag <= minLag + 2) throw new Error("Audio too short to estimate tempo");

  const acfAt = (lag: number): number => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i]! * x[i + lag]!;
    return s / (n - lag);
  };
  const acf0 = acfAt(0);
  if (acf0 <= 0) throw new Error("Silent or constant audio: no rhythm to analyse");

  const acf = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) acf[lag] = acfAt(lag);

  let best = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    const z = Math.log2(bpm / opts.priorBpm) / opts.priorOctaves;
    const score = acf[lag]! * Math.exp(-0.5 * z * z);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  const periodFrames = best + parabolicOffset(acf[best - 1]!, acf[best]!, acf[best + 1]!);
  return Object.freeze({
    bpm: (60 * frameRate) / periodFrames,
    periodFrames,
    confidence: Math.max(0, Math.min(1, acf[best]! / acf0)),
  });
}

/** Sub-sample peak offset in [-0.5, 0.5] from three neighbouring values. */
export function parabolicOffset(a: number, b: number, c: number): number {
  const denom = a - 2 * b + c;
  if (denom === 0) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
}

function sampleAt(env: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = env[i] ?? 0;
  const b = env[i + 1] ?? 0;
  return a + (b - a) * frac;
}

export interface BeatGrid {
  readonly periodFrames: number;
  readonly phaseFrames: number;
  readonly score: number;
}

/**
 * Jointly refines period (+/-2%) and phase by maximising the mean onset
 * strength sampled on the grid. Assumes a constant tempo (true for most
 * produced tracks used in highlight edits).
 */
export function fitBeatGrid(env: Float32Array, coarsePeriod: number): BeatGrid {
  const smooth = env.map((v, i) => 0.25 * (env[i - 1] ?? v) + 0.5 * v + 0.25 * (env[i + 1] ?? v));
  let best: BeatGrid = { periodFrames: coarsePeriod, phaseFrames: 0, score: -Infinity };
  const periodStep = coarsePeriod / 4000;
  for (let p = coarsePeriod * 0.98; p <= coarsePeriod * 1.02; p += periodStep) {
    for (let phase = 0; phase < p; phase += 0.25) {
      let sum = 0;
      let count = 0;
      for (let pos = phase; pos < smooth.length - 1; pos += p) {
        sum += sampleAt(smooth, pos);
        count++;
      }
      const score = count ? sum / count : 0;
      if (score > best.score) best = { periodFrames: p, phaseFrames: phase, score };
    }
  }
  return Object.freeze(best);
}
