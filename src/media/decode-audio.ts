import { run } from "./exec.js";

export const ANALYSIS_SAMPLE_RATE = 22050;

/** Decodes any audio file to mono 32-bit float PCM at ANALYSIS_SAMPLE_RATE via ffmpeg. */
export async function decodeMonoPcm(file: string, sampleRate = ANALYSIS_SAMPLE_RATE): Promise<Float32Array> {
  const { stdout } = await run("ffmpeg", [
    "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-acodec", "pcm_f32le", "-",
  ]);
  if (stdout.length < 4) throw new Error(`Decoded no audio samples from ${file}`);
  // Copy into a fresh, 4-byte aligned buffer (Node Buffers may share an unaligned pool).
  const aligned = new ArrayBuffer(stdout.length - (stdout.length % 4));
  new Uint8Array(aligned).set(stdout.subarray(0, aligned.byteLength));
  return new Float32Array(aligned);
}
