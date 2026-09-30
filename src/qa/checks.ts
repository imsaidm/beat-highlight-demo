import type { RenderManifest } from "../schema/render-manifest.js";
import type { BlackSegment, Loudness } from "./parse.js";

export const QA_THRESHOLDS = Object.freeze({
  durationToleranceSec: 0.5,
  loudnessTargetLufs: -14,
  loudnessToleranceLu: 2,
  maxTruePeakDbtp: -1,
  blackMinDurationSec: 0.5,
  /** Video stream vs the manifest frame count. */
  frameToleranceFrames: 2,
  /** Audio stream vs video stream length (AAC priming/padding is ~20-50 ms). */
  avSyncToleranceSec: 0.1,
});

export interface Measurements {
  /** Container (format) duration. */
  readonly duration: number;
  readonly videoDuration: number;
  readonly audioDuration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly hasAudio: boolean;
  readonly black: readonly BlackSegment[];
  readonly loudness: Loudness;
}

export interface QaCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
}

export interface QaReport {
  readonly passed: boolean;
  readonly file: string;
  readonly checks: readonly QaCheck[];
  readonly measurements: Measurements;
  readonly thresholds: typeof QA_THRESHOLDS;
  readonly manifestWarnings: readonly string[];
}

const check = (name: string, passed: boolean, expected: string, actual: string): QaCheck => ({ name, passed, expected, actual });

/** Pure: compares measurements against the manifest and thresholds. */
export function evaluateQa(file: string, m: Measurements, manifest: RenderManifest, t = QA_THRESHOLDS): QaReport {
  const { loudness: l } = m;
  const loudDelta = Math.abs(l.integrated - t.loudnessTargetLufs);
  const checks: QaCheck[] = [
    check("duration", Math.abs(m.duration - manifest.targetDuration) <= t.durationToleranceSec,
      `${manifest.targetDuration}s ±${t.durationToleranceSec}s`, `${m.duration.toFixed(3)}s`),
    check("frame-accurate-duration",
      Math.abs(m.videoDuration - manifest.durationInFrames / manifest.fps) <= t.frameToleranceFrames / manifest.fps,
      `${manifest.durationInFrames} frames (${(manifest.durationInFrames / manifest.fps).toFixed(3)}s) ±${t.frameToleranceFrames} frames`,
      `${m.videoDuration.toFixed(3)}s`),
    check("av-sync", !m.hasAudio || Math.abs(m.audioDuration - m.videoDuration) <= t.avSyncToleranceSec,
      `|audio - video| <= ${t.avSyncToleranceSec}s`,
      m.hasAudio ? `audio ${m.audioDuration.toFixed(3)}s vs video ${m.videoDuration.toFixed(3)}s` : "n/a (no audio)"),
    check("resolution", m.width === manifest.width && m.height === manifest.height,
      `${manifest.width}x${manifest.height}`, `${m.width}x${m.height}`),
    check("fps", Math.abs(m.fps - manifest.fps) < 0.01, `${manifest.fps}`, `${m.fps.toFixed(3)}`),
    check("audio-stream", m.hasAudio, "present", m.hasAudio ? "present" : "missing"),
    check("no-black-segments", m.black.length === 0, `no black >= ${t.blackMinDurationSec}s`,
      m.black.length ? m.black.map((b) => `${b.start.toFixed(2)}-${b.end.toFixed(2)}s`).join(", ") : "none"),
    check("integrated-loudness", Number.isFinite(l.integrated) && loudDelta <= t.loudnessToleranceLu,
      `${t.loudnessTargetLufs} ±${t.loudnessToleranceLu} LUFS`, `${l.integrated} LUFS`),
    check("true-peak", l.truePeak <= t.maxTruePeakDbtp, `<= ${t.maxTruePeakDbtp} dBTP`, `${l.truePeak} dBTP`),
  ];
  return {
    passed: checks.every((c) => c.passed),
    file,
    checks,
    measurements: m,
    thresholds: t,
    manifestWarnings: manifest.warnings,
  };
}
