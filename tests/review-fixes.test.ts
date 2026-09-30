/** Regression tests for the code-review findings (H1, H2, M1, M4, M5, M8). */
import { describe, expect, it } from "vitest";
import { isMezzanineCompliant } from "../src/media/normalize.js";
import type { ProbeResult } from "../src/media/probe.js";
import { evaluateQa, type Measurements } from "../src/qa/checks.js";
import { RuleBasedPlanner } from "../src/planner/rule-based.js";
import type { Beatmap } from "../src/schema/beatmap.js";
import type { RenderManifest } from "../src/schema/render-manifest.js";
import { assertInvariants } from "../src/solver/invariants.js";
import { fillRegion } from "../src/solver/layout.js";
import { planAndSolve, RENDER_FPS } from "../src/solver/solve.js";
import { SolverError, STYLE_RULES, type ClipInfo } from "../src/solver/types.js";
import { gridBeatmap, makeClips, makeManifest } from "./helpers.js";

const clip = (id: string, importance: number, seconds: number): ClipInfo => ({
  id, src: `${id}.mp4`, player: id, event: "play", importance, usableStart: 0, usableEnd: seconds,
});

const solve = (clips: ClipInfo[], beatmap: Beatmap) =>
  planAndSolve({ manifest: makeManifest(), clips, beatmap, musicSrc: "m.wav" }, new RuleBasedPlanner());

describe("H1: fillRegion drops the unusable clip, not the weakest", () => {
  const region = (entries: ClipInfo[]) => ({
    name: "pre-drop",
    start: 4,
    end: 20,
    entries: entries.map((c, i) => ({ clip: c, role: i === 0 ? ("opener" as const) : ("build" as const) })),
    pinned: new Set(["opener" as const]),
  });

  it("keeps opener, A, D and drops only the 0.5s clip B", () => {
    const r = fillRegion(
      region([clip("opener", 3, 6), clip("A", 3, 6), clip("B", 4, 0.5), clip("D", 2, 6)]),
      STYLE_RULES.hype,
      0.5,
    );
    expect(r.slots.map((s) => s.clip.id)).toEqual(["opener", "A", "D"]);
    expect(r.warnings.join(" ")).toContain("B");
    expect(r.slots.reduce((a, s) => a + s.endBeat - s.startBeat, 0)).toBe(16);
  });

  it("throws a clear error when the pinned opener itself is unusable", () => {
    expect(() => fillRegion(region([clip("opener", 3, 0.5), clip("A", 3, 6)]), STYLE_RULES.hype, 0.5)).toThrow(
      /opener.*too short/,
    );
  });
});

describe("H2: music start is quantised to the frame grid", () => {
  it.each([120, 128, 95])("at %i BPM every beat frame matches the music within half a frame", async (bpm) => {
    const beatmap = gridBeatmap({ bpm, duration: 90, dropAt: 64 });
    const { manifest } = await solve(makeClips(10, 7), beatmap);
    const { startAt } = manifest.music;
    expect(startAt).toBeGreaterThan(0);
    expect(Math.abs(startAt * RENDER_FPS - Math.round(startAt * RENDER_FPS))).toBeLessThan(1e-6);
    const startIdx = beatmap.beats.findIndex((t) => Math.abs(t - startAt) <= 1 / 60 + 1e-9);
    expect(startIdx).toBeGreaterThanOrEqual(0);
    manifest.beatFrames.forEach((f, i) => {
      expect(Math.abs(f / RENDER_FPS + startAt - beatmap.beats[startIdx + i]!)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    });
  });
});

describe("M1: variable frame rate sources are not stream-copied", () => {
  const base: ProbeResult = { duration: 5, width: 1280, height: 720, fps: 30, rFps: 30, codec: "h264", pixFmt: "yuv420p", hasAudio: false, videoDuration: 5, audioDuration: 0 };
  it("accepts true CFR 30fps H.264 and rejects VFR (r_frame_rate != 30)", () => {
    expect(isMezzanineCompliant(base)).toBe(true);
    expect(isMezzanineCompliant({ ...base, rFps: 60 })).toBe(false);
  });
});

describe("M4: QA checks frame-accurate duration and A/V sync", () => {
  const manifest = { width: 1080, height: 1920, fps: 30, targetDuration: 30, durationInFrames: 900, warnings: [] } as unknown as RenderManifest;
  const good: Measurements = {
    duration: 30.05, videoDuration: 30, audioDuration: 30.02, width: 1080, height: 1920, fps: 30, hasAudio: true, black: [],
    loudness: { integrated: -14, lra: 5, truePeak: -1.6 },
  };
  it("passes when video matches durationInFrames and audio matches video", () => {
    expect(evaluateQa("x.mp4", good, manifest).passed).toBe(true);
  });
  it("fails when the video stream drifts more than 2 frames from the manifest", () => {
    const r = evaluateQa("x.mp4", { ...good, videoDuration: 30.1 }, manifest);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.name)).toContain("frame-accurate-duration");
  });
  it("fails when audio and video durations diverge", () => {
    const r = evaluateQa("x.mp4", { ...good, audioDuration: 29.5 }, manifest);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(["av-sync"]);
  });
});

describe("M5: assertInvariants guards the render manifest", () => {
  const clips = makeClips(10, 6);
  const solved = () => solve(clips, gridBeatmap());

  it("accepts a solver-produced manifest", async () => {
    const { manifest } = await solved();
    expect(() => assertInvariants(manifest, clips)).not.toThrow();
  });

  it.each([
    ["gap between shots", (m: RenderManifest) => ({ ...m, segments: m.segments.map((s, i) => (i === 2 ? { ...s, fromFrame: s.fromFrame + 1 } : s)) })],
    ["outro not ending the video", (m: RenderManifest) => ({ ...m, outro: { ...m.outro, durationInFrames: m.outro.durationInFrames - 1 } })],
    ["source past usable footage", (m: RenderManifest) => ({ ...m, segments: m.segments.map((s, i) => (i === 0 ? { ...s, sourceStart: 5.9 } : s)) })],
  ])("rejects %s", async (_name, tamper) => {
    const { manifest } = await solved();
    const err = (() => {
      try {
        assertInvariants(tamper(manifest), clips);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(err).toBeInstanceOf(SolverError);
    expect((err as SolverError).code).toBe("INVARIANT");
  });
});

describe("M8: uses the strongest drop that fits the window", () => {
  it("skips a too-early strongest drop and lands the top play on the next one", async () => {
    const base = gridBeatmap({ duration: 40, dropAt: null });
    const beatmap: Beatmap = {
      ...base,
      drops: [
        { time: 2, beatIndex: 4, strength: 20 },
        { time: 20, beatIndex: 40, strength: 10 },
      ],
    };
    const { manifest } = await solve(makeClips(10, 6), beatmap);
    const top = manifest.segments.find((s) => s.role === "top")!;
    expect(top.isDrop).toBe(true);
    expect(top.fromFrame / RENDER_FPS + manifest.music.startAt).toBeCloseTo(20, 1);
  });
});
