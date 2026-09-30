import { FPS } from "../constants.js";
import type { Style } from "../schema/input-manifest.js";

/** A clip after probing/normalisation: everything the solver needs, nothing it doesn't. */
export interface ClipInfo {
  readonly id: string;
  /** Public path of the mezzanine file (Remotion staticFile src). */
  readonly src: string;
  readonly player: string;
  readonly event: string;
  readonly importance: number;
  /** Usable source range in seconds (inPoint/outPoint clamped to the real duration). */
  readonly usableStart: number;
  readonly usableEnd: number;
}

export interface StyleRules {
  /** Shortest allowed shot, in beats. */
  readonly minBeats: number;
  /** Typical shot length used to budget the number of shots. */
  readonly targetBeats: number;
  /** Cuts are allocated in multiples of this many beats when possible. */
  readonly unitBeats: number;
  /** Length of the top-play shot on the drop, in beats. */
  readonly dropBeats: number;
  /** Playback rate of the top play (1 = no slow-mo). */
  readonly dropPlaybackRate: number;
  readonly introBars: number;
  readonly outroBars: number;
  /** Slow-down rates tried (in order) when footage is too short to fill a region. */
  readonly stretchRates: readonly number[];
  /** Where the drop should land, as a fraction of the video (music offset is chosen to approximate it). */
  readonly dropPosition: number;
}

export const STYLE_RULES: Readonly<Record<Style, StyleRules>> = Object.freeze({
  hype: Object.freeze({
    minBeats: 2, targetBeats: 4, unitBeats: 2, dropBeats: 8, dropPlaybackRate: 0.5,
    introBars: 1, outroBars: 1, stretchRates: Object.freeze([0.85, 0.7]), dropPosition: 0.55,
  }),
  recruiting: Object.freeze({
    minBeats: 4, targetBeats: 8, unitBeats: 4, dropBeats: 8, dropPlaybackRate: 1,
    introBars: 1, outroBars: 2, stretchRates: Object.freeze([0.85]), dropPosition: 0.5,
  }),
});

export type Role = "opener" | "build" | "top" | "afterDrop" | "closer";

/** A shot on the beat grid: [startBeat, endBeat) are indices into the beatmap's beats. */
export interface Slot {
  readonly clip: ClipInfo;
  readonly role: Role;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly playbackRate: number;
}

export class SolverError extends Error {
  constructor(
    message: string,
    readonly code: "MUSIC_TOO_SHORT" | "INSUFFICIENT_FOOTAGE" | "INVALID_PLAN" | "INVARIANT",
  ) {
    super(message);
    this.name = "SolverError";
  }
}

/** Keep this many seconds clear of a clip's end so frame rounding never seeks past it. */
export const END_SAFETY_SEC = 2 / FPS;

export function usableSeconds(c: ClipInfo): number {
  return Math.max(0, c.usableEnd - c.usableStart - END_SAFETY_SEC);
}

/** Largest whole number of beats this clip can fill at `rate` without running out of footage. */
export function maxBeatsFor(c: ClipInfo, beatSec: number, rate: number): number {
  return Math.floor(usableSeconds(c) / (beatSec * rate) + 1e-9);
}
