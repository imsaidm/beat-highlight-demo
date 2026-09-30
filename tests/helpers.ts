import type { Beatmap } from "../src/schema/beatmap.js";
import { parseInputManifest, type InputManifest } from "../src/schema/input-manifest.js";
import type { ClipInfo } from "../src/solver/types.js";

/** Synthetic drum loop as raw PCM: kick every beat, hats on 8ths, optional quiet intro before `dropAt`. */
export function synthGroove(bpm: number, duration: number, sampleRate: number, dropAt?: number): Float32Array {
  const pcm = new Float32Array(Math.floor(duration * sampleRate));
  const beat = 60 / bpm;
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    const tb = t % beat;
    const th = t % (beat / 2);
    const loud = dropAt === undefined || t >= dropAt ? 1 : 0.25;
    const kick = Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 10);
    const hat = rand() * Math.exp(-th * 90);
    pcm[i] = loud * (0.7 * kick + 0.15 * hat);
  }
  return pcm;
}

export function gridBeatmap(opts: { bpm?: number; duration?: number; dropAt?: number | null } = {}): Beatmap {
  const bpm = opts.bpm ?? 120;
  const duration = opts.duration ?? 40;
  const period = 60 / bpm;
  const beats = Array.from({ length: Math.floor(duration / period) }, (_, i) => Number((i * period).toFixed(4)));
  const dropAt = opts.dropAt === undefined ? 16 : opts.dropAt;
  const dropIdx = dropAt === null ? -1 : Math.round(dropAt / period);
  return {
    version: 1,
    source: "synthetic",
    duration,
    sampleRate: 22050,
    bpm,
    tempoConfidence: 0.9,
    beats,
    downbeatIndices: beats.map((_, i) => i).filter((i) => i % 4 === 0),
    energyHop: 0.25,
    energy: [1],
    drops: dropIdx >= 0 ? [{ time: beats[dropIdx]!, beatIndex: dropIdx, strength: 10 }] : [],
  };
}

export function makeClips(n: number, duration = 5, importances?: readonly number[]): ClipInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `clip-${String(i).padStart(2, "0")}`,
    src: `clips/clip-${i}.mp4`,
    player: `#${i} Player`,
    event: "dunk",
    importance: importances?.[i] ?? (i % 5) + 1,
    usableStart: 0,
    usableEnd: duration,
  }));
}

export function makeManifest(overrides: Record<string, unknown> = {}): InputManifest {
  return parseInputManifest({
    title: "TEST",
    style: "hype",
    format: "vertical",
    music: "m.wav",
    clips: [
      { id: "a", file: "a.mp4", player: "A", event: "dunk", importance: 5 },
      { id: "b", file: "b.mp4", player: "B", event: "three", importance: 3 },
      { id: "c", file: "c.mp4", player: "C", event: "block", importance: 1 },
    ],
    ...overrides,
  });
}
