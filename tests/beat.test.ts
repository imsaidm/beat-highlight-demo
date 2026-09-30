import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_MUSIC, musicArgs } from "../scripts/sample-specs.js";
import { analyzeFile, analyzePcm } from "../src/beat/analyze.js";
import { snapDropsToDownbeats } from "../src/beat/downbeats.js";
import { createFftPlan } from "../src/beat/fft.js";
import { parabolicOffset } from "../src/beat/tempo.js";
import { isAvailable, run } from "../src/media/exec.js";
import { synthGroove } from "./helpers.js";

const SR = 22050;

describe("fft", () => {
  it("puts a pure tone's energy in the right bin", () => {
    const plan = createFftPlan(1024);
    const bin = 40;
    const frame = Array.from({ length: 1024 }, (_, i) => Math.sin((2 * Math.PI * bin * i) / 1024));
    const mag = plan.magnitude(frame);
    expect(mag.indexOf(Math.max(...mag))).toBe(bin);
  });

  it("rejects non power-of-two sizes", () => {
    expect(() => createFftPlan(1000)).toThrow(/power of two/);
  });
});

describe("tempo + beat grid (pure PCM)", () => {
  it.each([100, 120, 128, 140])("detects %i BPM within +/-3", (bpm) => {
    const bm = analyzePcm(synthGroove(bpm, 30, SR), SR);
    expect(Math.abs(bm.bpm - bpm)).toBeLessThanOrEqual(3);
  });

  it("places beats within 30ms of the true onsets", () => {
    const bm = analyzePcm(synthGroove(120, 20, SR), SR);
    const errors = bm.beats.map((t) => Math.abs(t - Math.round(t / 0.5) * 0.5));
    expect(Math.max(...errors)).toBeLessThan(0.03);
    expect(bm.beats[0]).toBeLessThan(0.05);
  });

  it("finds the drop and makes it a downbeat", () => {
    const bm = analyzePcm(synthGroove(120, 32, SR, 16), SR);
    expect(bm.drops.length).toBeGreaterThan(0);
    expect(Math.abs(bm.drops[0]!.time - 16)).toBeLessThan(0.1);
    expect(bm.downbeatIndices).toContain(bm.drops[0]!.beatIndex);
    expect(bm.energy.every((e) => e >= 0 && e <= 1)).toBe(true);
  });

  it("fails loudly on silence", () => {
    expect(() => analyzePcm(new Float32Array(SR * 10), SR)).toThrow(/Silent|rhythm/);
  });

  it("parabolic interpolation stays within half a sample", () => {
    expect(parabolicOffset(1, 2, 1)).toBeCloseTo(0);
    expect(parabolicOffset(1, 2, 1.5)).toBeGreaterThan(0);
    expect(Math.abs(parabolicOffset(0, 1, 5))).toBeLessThanOrEqual(0.5);
  });

  it("snaps drops to the nearest downbeat and dedupes", () => {
    const beats = Array.from({ length: 40 }, (_, i) => i * 0.5);
    const drops = [
      { time: 15.5, beatIndex: 31, strength: 9 },
      { time: 16.5, beatIndex: 33, strength: 5 },
    ];
    expect(snapDropsToDownbeats(drops, beats, 0)).toEqual([{ time: 16, beatIndex: 32, strength: 9 }]);
  });
});

describe.skipIf(!(await isAvailable("ffmpeg")))("synthetic 120 BPM track (ffmpeg integration)", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("detects ~120 BPM and the drop at ~16s", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "beat-"));
    const file = path.join(dir, "music.wav");
    await run("ffmpeg", musicArgs(DEFAULT_MUSIC, file));
    const bm = await analyzeFile(file);
    expect(Math.abs(bm.bpm - 120)).toBeLessThanOrEqual(3);
    expect(Math.abs(bm.drops[0]!.time - DEFAULT_MUSIC.dropAt)).toBeLessThan(0.1);
    expect(bm.beats.length).toBeGreaterThanOrEqual(75);
  });
});
