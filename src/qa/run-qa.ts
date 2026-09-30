import path from "node:path";
import { run } from "../media/exec.js";
import { probe } from "../media/probe.js";
import type { RenderManifest } from "../schema/render-manifest.js";
import { evaluateQa, QA_THRESHOLDS, type QaReport } from "./checks.js";
import { parseBlackdetect, parseEbur128 } from "./parse.js";

/** Measures the rendered file with ffprobe + ffmpeg blackdetect/ebur128 and evaluates it. */
export async function runQa(file: string, manifest: RenderManifest): Promise<QaReport> {
  const info = await probe(file, "video");
  const black = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", file, "-an",
    "-vf", `blackdetect=d=${QA_THRESHOLDS.blackMinDurationSec}:pix_th=0.10`, "-f", "null", "-",
  ]);
  const loud = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-",
  ]);
  return evaluateQa(
    path.basename(file),
    {
      duration: info.duration,
      videoDuration: info.videoDuration,
      audioDuration: info.audioDuration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      hasAudio: info.hasAudio,
      black: parseBlackdetect(black.stderr),
      loudness: parseEbur128(loud.stderr),
    },
    manifest,
  );
}
