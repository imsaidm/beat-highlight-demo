import { z } from "zod";

export const BeatmapSchema = z.object({
  version: z.literal(1),
  source: z.string(),
  duration: z.number().positive(),
  sampleRate: z.number().int().positive(),
  bpm: z.number().positive(),
  /** Confidence of the tempo estimate in [0, 1] (normalised autocorrelation peak). */
  tempoConfidence: z.number().min(0).max(1),
  /** Beat times in seconds, ascending. */
  beats: z.array(z.number().min(0)),
  /** Indices into `beats` that are bar downbeats (every 4 beats). */
  downbeatIndices: z.array(z.number().int().min(0)),
  /** Energy curve sampled every `energyHop` seconds, normalised to [0, 1]. */
  energyHop: z.number().positive(),
  energy: z.array(z.number().min(0).max(1)),
  /** Drop candidates (on downbeats), strongest first. */
  drops: z.array(z.object({ time: z.number().min(0), beatIndex: z.number().int().min(0), strength: z.number() })),
});

export type Beatmap = z.infer<typeof BeatmapSchema>;
