import { z } from "zod";

/** Bump MAJOR on breaking changes to the render contract consumed by the Remotion composition. */
export const RENDER_MANIFEST_VERSION = "1.0.0";

const frame = z.number().int().min(0);

export const SegmentSchema = z.object({
  clipId: z.string(),
  src: z.string(),
  player: z.string(),
  event: z.string(),
  importance: z.number().int().min(1).max(5),
  role: z.enum(["opener", "build", "top", "afterDrop", "closer"]),
  fromFrame: frame,
  durationInFrames: z.number().int().positive(),
  /** Where playback starts inside the mezzanine clip, in seconds. */
  sourceStart: z.number().min(0),
  /** Seconds of source consumed = duration / fps * playbackRate. */
  sourceDuration: z.number().positive(),
  playbackRate: z.number().positive().max(4),
  startsOnDownbeat: z.boolean(),
  isDrop: z.boolean(),
});

export const CardSchema = z.object({
  fromFrame: frame,
  durationInFrames: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string(),
});

export const RenderManifestSchema = z.object({
  version: z.literal(RENDER_MANIFEST_VERSION),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.enum(["vertical", "square", "landscape"]),
  style: z.enum(["hype", "recruiting"]),
  durationInFrames: z.number().int().positive(),
  targetDuration: z.number().positive(),
  music: z.object({ src: z.string(), startAt: z.number().min(0), bpm: z.number().positive() }),
  intro: CardSchema,
  outro: CardSchema,
  segments: z.array(SegmentSchema).min(1),
  /** Video-timeline frames of every beat / downbeat / drop, for beat-synced effects. */
  beatFrames: z.array(frame),
  downbeatFrames: z.array(frame),
  dropFrames: z.array(frame),
  planner: z.string(),
  warnings: z.array(z.string()),
});

export type Segment = z.infer<typeof SegmentSchema>;
export type Card = z.infer<typeof CardSchema>;
export type RenderManifest = z.infer<typeof RenderManifestSchema>;
