import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { FPS } from "../constants.js";
import { run } from "./exec.js";
import type { ProbeResult } from "./probe.js";

export const MEZZANINE_FPS = FPS;
const NORMALIZE_VERSION = "v2";

/**
 * Streaming-style loudness. True-peak target leaves headroom for AAC encoding,
 * which overshoots transient-heavy music by ~0.5-1 dB (the QA gate is -1 dBTP).
 */
export const LOUDNESS_TARGET = Object.freeze({ integrated: -14, truePeak: -2.5, lra: 11 });
/** Sample-peak ceiling of the safety limiter after loudnorm (0.75 ~= -2.5 dBFS). */
const LIMITER_CEILING = 0.75;

/**
 * Pure: does this probe already meet the mezzanine spec (H.264, yuv420p, CFR 30fps)?
 * Both the average and the base (r_frame_rate) rate must be 30: phone footage is
 * often VFR with a 30fps average, and stream-copying it would drift against the frame grid.
 */
export function isMezzanineCompliant(p: ProbeResult): boolean {
  const is30 = (v: number): boolean => Math.abs(v - MEZZANINE_FPS) < 0.01;
  return p.codec === "h264" && p.pixFmt === "yuv420p" && is30(p.fps) && is30(p.rFps);
}

async function cacheKey(file: string, extra: string): Promise<string> {
  const s = await stat(file);
  return createHash("sha1")
    .update(`${NORMALIZE_VERSION}|${path.resolve(file)}|${s.size}|${s.mtimeMs}|${extra}`)
    .digest("hex")
    .slice(0, 10);
}

/**
 * Runs ffmpeg into a temp file and renames it into place only on success, so
 * an interrupted run never leaves a truncated file that later looks "cached".
 */
async function writeAtomically(file: string, build: (tmp: string) => Promise<void>): Promise<void> {
  const ext = path.extname(file);
  const tmp = `${file.slice(0, -ext.length)}.partial${ext}`;
  try {
    await build(tmp);
    await rename(tmp, file);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

const COPY_ARGS = ["-c", "copy"] as const;
const TRANSCODE_ARGS = [
  "-vf", `fps=${MEZZANINE_FPS},format=yuv420p`,
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "15", "-bf", "0",
] as const;
const LIMITER = `alimiter=limit=${LIMITER_CEILING}:attack=1:release=40:level=false`;

export interface NormalizedClip {
  readonly file: string;
  /** Path relative to the mezzanine dir (used as Remotion staticFile src). */
  readonly publicPath: string;
  readonly transcoded: boolean;
  readonly cached: boolean;
}

/** Produces a CFR 30fps H.264 mezzanine (video only, short GOP for fast seeking). Cached by content key. */
export async function normalizeClip(src: string, id: string, p: ProbeResult, mezzDir: string): Promise<NormalizedClip> {
  await mkdir(path.join(mezzDir, "clips"), { recursive: true });
  const compliant = isMezzanineCompliant(p);
  const codecArgs = compliant ? COPY_ARGS : TRANSCODE_ARGS;
  // Key covers the source AND the exact encode settings, so changing them invalidates the cache.
  const key = await cacheKey(src, `clip|${codecArgs.join(" ")}`);
  const publicPath = `clips/${id}-${key}.mp4`;
  const file = path.join(mezzDir, publicPath);
  if (existsSync(file)) return Object.freeze({ file, publicPath, transcoded: !compliant, cached: true });

  await writeAtomically(file, async (tmp) => {
    await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-map", "0:v:0", ...codecArgs, "-an", "-movflags", "+faststart", tmp]);
  });
  return Object.freeze({ file, publicPath, transcoded: !compliant, cached: false });
}

const LoudnormSchema = z.object({
  input_i: z.string(),
  input_tp: z.string(),
  input_lra: z.string(),
  input_thresh: z.string(),
  target_offset: z.string(),
});

/** Pure: extracts the JSON block printed by loudnorm's first pass. */
export function parseLoudnormJson(stderr: string): z.infer<typeof LoudnormSchema> {
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!match) throw new Error("loudnorm analysis produced no JSON summary");
  return LoudnormSchema.parse(JSON.parse(match[0]));
}

/** Two-pass linear loudnorm + safety limiter to a 48kHz stereo WAV (WAV avoids AAC priming delay shifting the beat grid). */
export async function normalizeMusic(src: string, mezzDir: string): Promise<NormalizedClip> {
  await mkdir(mezzDir, { recursive: true });
  const key = await cacheKey(src, `${JSON.stringify(LOUDNESS_TARGET)}|${LIMITER}`);
  const publicPath = `music-${key}.wav`;
  const file = path.join(mezzDir, publicPath);
  if (existsSync(file)) return Object.freeze({ file, publicPath, transcoded: true, cached: true });

  const { integrated: I, truePeak: TP, lra: LRA } = LOUDNESS_TARGET;
  const pass1 = await run("ffmpeg", [
    "-hide_banner", "-i", src, "-af", `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, "-f", "null", "-",
  ]);
  const m = parseLoudnormJson(pass1.stderr);
  const filter =
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,` +
    `aresample=48000,${LIMITER}`;
  await writeAtomically(file, async (tmp) => {
    await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-af", filter, "-ac", "2", "-c:a", "pcm_s16le", tmp]);
  });
  return Object.freeze({ file, publicPath, transcoded: true, cached: false });
}
