import path from "node:path";
import { ANALYSIS_SAMPLE_RATE, decodeMonoPcm } from "../media/decode-audio.js";
import { BeatmapSchema, type Beatmap } from "../schema/beatmap.js";
import { chooseDownbeatPhase, downbeatIndices, snapDropsToDownbeats } from "./downbeats.js";
import { detectDrops, energyCurve } from "./energy.js";
import { DEFAULT_ONSET_OPTIONS, onsetEnvelope } from "./onset.js";
import { estimateTempo, fitBeatGrid } from "./tempo.js";

const ENERGY_HOP = 0.25;
const round = (v: number, d = 4): number => Number(v.toFixed(d));

/** Pure: PCM in, validated beatmap out. */
export function analyzePcm(pcm: Float32Array, sampleRate: number, source = "pcm"): Beatmap {
  const duration = pcm.length / sampleRate;
  const onset = onsetEnvelope(pcm, sampleRate, DEFAULT_ONSET_OPTIONS);
  const tempo = estimateTempo(onset.flux, onset.frameRate);
  const grid = fitBeatGrid(onset.flux, tempo.periodFrames);
  const periodSec = grid.periodFrames / onset.frameRate;

  // The grid phase is found in [0, period) envelope frames; extend it backwards
  // so a beat sitting on (or a hair before) t=0 is not lost.
  const firstT = grid.phaseFrames / onset.frameRate + onset.timeOffset;
  const startT = firstT - Math.floor((firstT + 0.03) / periodSec) * periodSec;
  const beats: number[] = [];
  for (let t = startT; t < duration; t += periodSec) beats.push(round(Math.max(0, t)));
  if (beats.length < 8) throw new Error(`Only ${beats.length} beats detected in ${source}; need at least 2 bars`);

  const lowAccents = beats.map((t) => {
    const f = Math.round((t - onset.timeOffset) * onset.frameRate);
    return Math.max(onset.lowFlux[f - 1] ?? 0, onset.lowFlux[f] ?? 0, onset.lowFlux[f + 1] ?? 0);
  });
  const rawDrops = detectDrops(pcm, sampleRate, beats, periodSec);
  const phase = chooseDownbeatPhase(lowAccents, rawDrops[0]);
  const drops = snapDropsToDownbeats(rawDrops, beats, phase);

  return BeatmapSchema.parse({
    version: 1,
    source,
    duration: round(duration, 3),
    sampleRate,
    bpm: round(60 / periodSec, 2),
    tempoConfidence: round(tempo.confidence, 3),
    beats,
    downbeatIndices: downbeatIndices(beats.length, phase),
    energyHop: ENERGY_HOP,
    energy: energyCurve(pcm, sampleRate, ENERGY_HOP),
    drops,
  });
}

export async function analyzeFile(file: string): Promise<Beatmap> {
  const pcm = await decodeMonoPcm(file, ANALYSIS_SAMPLE_RATE);
  return analyzePcm(pcm, ANALYSIS_SAMPLE_RATE, path.basename(file));
}
