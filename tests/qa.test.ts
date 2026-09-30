import { describe, expect, it } from "vitest";
import { interpretProbe, parseRational } from "../src/media/probe.js";
import { parseLoudnormJson } from "../src/media/normalize.js";
import { evaluateQa, type Measurements } from "../src/qa/checks.js";
import { parseBlackdetect, parseEbur128 } from "../src/qa/parse.js";
import { flash, lastAtOrBefore, pulse } from "../src/remotion/beat-fx.js";
import type { RenderManifest } from "../src/schema/render-manifest.js";

const EBUR = `[Parsed_ebur128_0 @ 0x1] t: 29.9  M: -13.0 S: -13.9 I: -14.0 LUFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -13.8 LUFS
    Threshold: -24.1 LUFS

  Loudness range:
    LRA:         5.2 LU

  True peak:
    Peak:       -1.4 dBFS`;

const BLACK = `[blackdetect @ 0x2] black_start:0 black_end:0.733333 black_duration:0.733333
[blackdetect @ 0x2] black_start:12.5 black_end:13.1 black_duration:0.6`;

const manifest = { width: 1080, height: 1920, fps: 30, targetDuration: 30, durationInFrames: 900, warnings: [] } as unknown as RenderManifest;
const good: Measurements = {
  duration: 30.05, videoDuration: 30, audioDuration: 30.02, width: 1080, height: 1920, fps: 30, hasAudio: true, black: [],
  loudness: { integrated: -14.2, lra: 5, truePeak: -1.6 },
};

describe("ffmpeg log parsers", () => {
  it("parses the ebur128 summary (not the running values)", () => {
    expect(parseEbur128(EBUR)).toEqual({ integrated: -13.8, lra: 5.2, truePeak: -1.4 });
  });

  it("throws when ebur128 produced no summary", () => {
    expect(() => parseEbur128("nothing")).toThrow(/Summary/);
  });

  it("parses blackdetect segments", () => {
    expect(parseBlackdetect(BLACK)).toEqual([
      { start: 0, end: 0.733333, duration: 0.733333 },
      { start: 12.5, end: 13.1, duration: 0.6 },
    ]);
    expect(parseBlackdetect("")).toEqual([]);
  });

  it("parses loudnorm first-pass JSON", () => {
    const log = `[Parsed_loudnorm_0 @ 0x3] \n{\n\t"input_i" : "-16.60",\n\t"input_tp" : "-2.10",\n\t"input_lra" : "10.50",\n\t"input_thresh" : "-27.0",\n\t"target_offset" : "0.2"\n}`;
    expect(parseLoudnormJson(log).input_i).toBe("-16.60");
  });

  it("interprets ffprobe JSON and rational frame rates", () => {
    expect(parseRational("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseRational("0/0")).toBe(0);
    const p = interpretProbe(
      { streams: [{ codec_type: "video", codec_name: "h264", width: 1280, height: 720, pix_fmt: "yuv420p", avg_frame_rate: "60/1" }], format: { duration: "6.0" } },
      "x.mp4",
      "video",
    );
    expect(p).toMatchObject({ duration: 6, fps: 60, rFps: 60, hasAudio: false, codec: "h264", audioDuration: 0 });
    expect(() => interpretProbe({ streams: [], format: {} }, "y.mp4", "video")).toThrow(/no video stream/);
  });
});

describe("QA evaluation", () => {
  it("passes a compliant render", () => {
    const r = evaluateQa("out.mp4", good, manifest);
    expect(r.passed).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual([
      "duration", "frame-accurate-duration", "av-sync", "resolution", "fps", "audio-stream", "no-black-segments", "integrated-loudness", "true-peak",
    ]);
  });

  it.each([
    ["duration", { duration: 30.7 }],
    ["resolution", { width: 1920 }],
    ["audio-stream", { hasAudio: false }],
    ["no-black-segments", { black: [{ start: 1, end: 2, duration: 1 }] }],
    ["integrated-loudness", { loudness: { integrated: -20, lra: 5, truePeak: -3 } }],
    ["true-peak", { loudness: { integrated: -14, lra: 5, truePeak: -0.2 } }],
  ])("fails the %s check", (name, patch) => {
    const r = evaluateQa("out.mp4", { ...good, ...patch } as Measurements, manifest);
    expect(r.passed).toBe(false);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual([name]);
  });
});

describe("beat-synced effect helpers", () => {
  const beats = [0, 15, 30, 45];
  it("finds the latest trigger", () => {
    expect(lastAtOrBefore(beats, 29)).toBe(15);
    expect(lastAtOrBefore(beats, -1)).toBeUndefined();
  });
  it("pulses decay and flashes end", () => {
    expect(pulse(beats, 15, 4)).toBe(1);
    expect(pulse(beats, 19, 4)).toBeCloseTo(Math.exp(-1));
    expect(flash(beats, 17, 5)).toBeCloseTo(0.6);
    expect(flash(beats, 21, 5)).toBe(0);
  });
});
