/**
 * Minimal radix-2 FFT. Pure from the caller's perspective: inputs are never
 * mutated; scratch buffers are allocated per plan.
 */
export interface FftPlan {
  readonly size: number;
  readonly window: Float32Array;
  /** Magnitude spectrum (size/2 + 1 bins) of `frame` (length `size`), windowed. */
  magnitude(frame: ArrayLike<number>): Float32Array;
}

export function createFftPlan(size: number): FftPlan {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${size}`);
  const bits = Math.log2(size);
  const rev = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / size);
    sin[i] = Math.sin((-2 * Math.PI * i) / size);
  }
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));

  const magnitude = (frame: ArrayLike<number>): Float32Array => {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[rev[i]!] = (frame[i] ?? 0) * window[i]!;
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let start = 0; start < size; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step]!;
          const wi = sin[k * step]!;
          const a = start + k;
          const b = a + half;
          const tr = re[b]! * wr - im[b]! * wi;
          const ti = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
      }
    }
    const mag = new Float32Array(size / 2 + 1);
    for (let i = 0; i <= size / 2; i++) mag[i] = Math.hypot(re[i]!, im[i]!);
    return mag;
  };

  return Object.freeze({ size, window, magnitude });
}
