import { describe, expect, it } from "vitest";
import type { EditorialPlanner } from "../src/planner/editorial-planner.js";
import { RuleBasedPlanner } from "../src/planner/rule-based.js";
import type { Beatmap } from "../src/schema/beatmap.js";
import type { RenderManifest } from "../src/schema/render-manifest.js";
import { allocateBeats } from "../src/solver/allocate.js";
import { planAndSolve, RENDER_FPS } from "../src/solver/solve.js";
import { SolverError, type ClipInfo } from "../src/solver/types.js";
import { gridBeatmap, makeClips, makeManifest } from "./helpers.js";

const planner = new RuleBasedPlanner();

async function solve(clips: ClipInfo[], beatmap: Beatmap = gridBeatmap(), overrides: Record<string, unknown> = {}) {
  return planAndSolve({ manifest: makeManifest(overrides), clips, beatmap, musicSrc: "music.wav" }, planner);
}

const byId = (clips: readonly ClipInfo[]) => new Map(clips.map((c) => [c.id, c]));

function expectCutsOnBeats(m: RenderManifest): void {
  const beats = new Set(m.beatFrames);
  m.segments.forEach((s) => expect(beats.has(s.fromFrame), `${s.clipId} starts off-beat at ${s.fromFrame}`).toBe(true));
  expect(beats.has(m.outro.fromFrame)).toBe(true);
}

function expectContiguous(m: RenderManifest): void {
  expect(m.segments[0]!.fromFrame).toBe(m.intro.durationInFrames);
  m.segments.slice(1).forEach((s, i) => {
    const prev = m.segments[i]!;
    expect(prev.fromFrame + prev.durationInFrames).toBe(s.fromFrame);
  });
  const last = m.segments[m.segments.length - 1]!;
  expect(last.fromFrame + last.durationInFrames).toBe(m.outro.fromFrame);
  expect(m.outro.fromFrame + m.outro.durationInFrames).toBe(m.durationInFrames);
}

describe("timeline solver (10 clips, 120 BPM, drop at 16s)", () => {
  const clips = makeClips(10, 5, [5, 4, 4, 3, 3, 5, 2, 3, 2, 5]).map((c, i) => ({ ...c, usableEnd: 4 + (i % 4) }));

  it("snaps every cut to a beat and leaves no gaps", async () => {
    const { manifest } = await solve(clips);
    expectCutsOnBeats(manifest);
    expectContiguous(manifest);
  });

  it("hits the target duration within +/-0.5s", async () => {
    const { manifest } = await solve(clips);
    expect(Math.abs(manifest.durationInFrames / RENDER_FPS - 30)).toBeLessThanOrEqual(0.5);
  });

  it("never exceeds a clip's usable footage (incl. slow-mo)", async () => {
    const { manifest } = await solve(clips);
    const info = byId(clips);
    manifest.segments.forEach((s) => {
      const c = info.get(s.clipId)!;
      expect(s.sourceStart).toBeGreaterThanOrEqual(c.usableStart);
      expect(s.sourceStart + s.sourceDuration).toBeLessThanOrEqual(c.usableEnd + 1e-6);
      expect(s.sourceDuration).toBeCloseTo((s.durationInFrames / RENDER_FPS) * s.playbackRate, 2);
    });
  });

  it("puts the strongest play on the biggest drop, in slow-mo", async () => {
    const { manifest, plan } = await solve(clips);
    const drop = manifest.segments.find((s) => s.isDrop)!;
    expect(drop.clipId).toBe(plan.top);
    expect(drop.importance).toBe(5);
    expect(drop.role).toBe("top");
    expect(manifest.dropFrames).toContain(drop.fromFrame);
    expect(drop.fromFrame).toBe(16 * RENDER_FPS);
    expect(drop.playbackRate).toBe(0.5);
  });

  it("starts every importance-5 play on a downbeat", async () => {
    const { manifest } = await solve(clips);
    const downbeats = new Set(manifest.downbeatFrames);
    manifest.segments.filter((s) => s.importance === 5).forEach((s) => expect(downbeats.has(s.fromFrame), s.clipId).toBe(true));
  });

  it("follows the story arc: opener, rising build, top, closer = 2nd best", async () => {
    const { manifest } = await solve(clips);
    const roles = manifest.segments.map((s) => s.role);
    expect(roles[0]).toBe("opener");
    expect(roles[roles.length - 1]).toBe("closer");
    const build = manifest.segments.filter((s) => s.role === "build").map((s) => s.importance);
    expect(build).toEqual([...build].sort((a, b) => a - b));
    expect(manifest.segments[manifest.segments.length - 1]!.importance).toBe(5);
  });

  it("is deterministic", async () => {
    const a = await solve(clips);
    const b = await solve(clips);
    expect(a.manifest).toEqual(b.manifest);
  });

  it("respects recruiting rules: >= 4-beat shots, no slow-mo", async () => {
    const long = clips.map((c) => ({ ...c, usableEnd: 8 }));
    const { manifest } = await solve(long, gridBeatmap(), { style: "recruiting" });
    manifest.segments.forEach((s) => expect(s.durationInFrames).toBeGreaterThanOrEqual(4 * 15));
    expect(manifest.segments.every((s) => s.playbackRate === 1)).toBe(true);
    expectContiguous(manifest);
  });
});

describe("timeline solver edge cases", () => {
  it("too many clips: keeps the strongest, reports the dropped ones", async () => {
    const clips = makeClips(40, 6);
    const { manifest, plan } = await solve(clips);
    expect(plan.dropped.length).toBeGreaterThan(0);
    expect(manifest.segments.length + plan.dropped.length).toBe(40);
    expect(manifest.warnings.some((w) => w.includes("dropped"))).toBe(true);
    const keptMin = Math.min(...manifest.segments.map((s) => s.importance));
    const droppedMax = Math.max(...plan.dropped.map((id) => clips.find((c) => c.id === id)!.importance));
    expect(keptMin).toBeGreaterThanOrEqual(droppedMax);
    expectContiguous(manifest);
  });

  it("too few clips / too little footage: fails with a clear error", async () => {
    const err = await solve(makeClips(3, 1.2)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SolverError);
    expect((err as SolverError).code).toBe("INSUFFICIENT_FOOTAGE");
    expect((err as Error).message).toMatch(/need \d+ beats/);
  });

  it("slightly short footage: stretches with slow-mo and warns", async () => {
    const clips = makeClips(10, 2.4);
    const { manifest } = await solve(clips);
    expect(manifest.warnings.some((w) => w.includes("slowed"))).toBe(true);
    expectContiguous(manifest);
  });

  it("planner keeps extra plays rather than slow-mo stretching (recruiting, short clips)", async () => {
    const clips = makeClips(10, 5, [5, 4, 4, 3, 3, 5, 2, 3, 2, 5]);
    const { manifest, plan } = await solve(clips, gridBeatmap(), { style: "recruiting" });
    expect(manifest.warnings.some((w) => w.includes("slowed"))).toBe(false);
    expect(manifest.segments.every((s) => s.role === "top" || s.playbackRate === 1)).toBe(true);
    expect(plan.dropped.length).toBeGreaterThan(0);
  });

  it("music too short for the target: fails with MUSIC_TOO_SHORT", async () => {
    const err = await solve(makeClips(10, 6), gridBeatmap({ duration: 20 })).catch((e: unknown) => e);
    expect((err as SolverError).code).toBe("MUSIC_TOO_SHORT");
  });

  it("no drop in the music: still places the top play on a downbeat and warns", async () => {
    const { manifest } = await solve(makeClips(10, 6), gridBeatmap({ dropAt: null }));
    const drop = manifest.segments.find((s) => s.role === "top")!;
    expect(manifest.downbeatFrames).toContain(drop.fromFrame);
    expect(manifest.warnings.some((w) => w.includes("No drop"))).toBe(true);
  });

  it("late drop: offsets the music so the drop lands inside the video", async () => {
    const { manifest } = await solve(makeClips(10, 6), gridBeatmap({ duration: 90, dropAt: 64 }));
    expect(manifest.music.startAt).toBeGreaterThan(0);
    const drop = manifest.segments.find((s) => s.isDrop)!;
    expect(drop.fromFrame / RENDER_FPS + manifest.music.startAt).toBeCloseTo(64, 1);
  });

  it("works at other tempos (95 BPM) without drifting off the grid", async () => {
    const { manifest } = await solve(makeClips(10, 7), gridBeatmap({ bpm: 95, duration: 45 }));
    expectCutsOnBeats(manifest);
    expect(Math.abs(manifest.durationInFrames / RENDER_FPS - 30)).toBeLessThanOrEqual(0.5);
  });

  it("rejects an invalid editorial plan (e.g. hallucinated LLM output)", async () => {
    const bad: EditorialPlanner = { name: "bad-llm", plan: async () => ({ opener: "ghost", build: [], top: "clip-00", afterDrop: [], closer: "clip-01" }) };
    const err = await planAndSolve({ manifest: makeManifest(), clips: makeClips(3, 8), beatmap: gridBeatmap(), musicSrc: "m.wav" }, bad).catch((e: unknown) => e);
    expect((err as SolverError).code).toBe("INVALID_PLAN");
    expect((err as Error).message).toMatch(/unknown clips: ghost/);
  });
});

describe("allocateBeats", () => {
  it("fills exactly, within bounds, favouring weight", () => {
    const alloc = allocateBeats(16, [{ min: 2, max: 8, weight: 1 }, { min: 2, max: 8, weight: 5 }, { min: 2, max: 3, weight: 5 }], 2)!;
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(16);
    expect(alloc[1]).toBeGreaterThan(alloc[0]!);
    expect(alloc[2]).toBeLessThanOrEqual(3);
  });

  it("returns null when infeasible", () => {
    expect(allocateBeats(4, [{ min: 2, max: 4, weight: 1 }, { min: 4, max: 4, weight: 1 }], 2)).toBeNull();
    expect(allocateBeats(20, [{ min: 2, max: 4, weight: 1 }], 2)).toBeNull();
  });
});
