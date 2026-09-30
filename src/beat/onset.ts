import { createFftPlan } from "./fft.js";

export interface OnsetOptions {
  readonly frameSize: number;
  readonly hop: number;
  /** Upper frequency (Hz) of the "low band" used for kick/downbeat accents. */
  readonly lowBandHz: number;
}

export const DEFAULT_ONSET_OPTIONS: OnsetOptions = Object.freeze({ frameSize: 1024, hop: 256, lowBandHz: 150 });

export interface OnsetEnvelope {
  /** Full-band spectral flux per frame. */
  readonly flux: Float32Array;
  /** Low-band spectral flux per frame (kick drum proxy). */
  readonly lowFlux: Float32Array;
  /** Envelope frames per second. */
  readonly frameRate: number;
  /** Seconds to add to `frame / frameRate` to get the frame's centre time. */
  readonly timeOffset: number;
}

/**
 * Spectral-flux onset strength: sum over bins of the half-wave rectified
 * increase in log-compressed magnitude between consecutive STFT frames.
 */
export function onsetEnvelope(pcm: Float32Array, sampleRate: number, opts: OnsetOptions = DEFAULT_ONSET_OPTIONS): OnsetEnvelope {
  const { frameSize, hop, lowBandHz } = opts;
  if (pcm.length < frameSize) throw new Error(`Audio too short for analysis (${pcm.length} samples)`);
  const plan = createFftPlan(frameSize);
  const frames = Math.floor((pcm.length - frameSize) / hop) + 1;
  const lowBins = Math.max(2, Math.ceil((lowBandHz * frameSize) / sampleRate));
  const flux = new Float32Array(frames);
  const lowFlux = new Float32Array(frames);
  let prev: Float32Array | null = null;

  for (let f = 0; f < frames; f++) {
    const mag = plan.magnitude(pcm.subarray(f * hop, f * hop + frameSize));
    const logMag = mag.map((m) => Math.log1p(100 * m));
    if (prev) {
      let sum = 0;
      let low = 0;
      for (let b = 1; b < logMag.length; b++) {
        const d = logMag[b]! - prev[b]!;
        if (d > 0) {
          sum += d;
          if (b <= lowBins) low += d;
        }
      }
      flux[f] = sum;
      lowFlux[f] = low;
    }
    prev = logMag;
  }
  return Object.freeze({ flux, lowFlux, frameRate: sampleRate / hop, timeOffset: frameSize / 2 / sampleRate });
}
