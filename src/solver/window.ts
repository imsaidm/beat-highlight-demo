import type { Beatmap } from "../schema/beatmap.js";
import { SolverError, type StyleRules } from "./types.js";

const BAR = 4;

/** The musical skeleton of the edit, in beat indices of the beatmap. */
export interface TimelineWindow {
  readonly startBeat: number;
  readonly introEndBeat: number;
  readonly dropBeat: number;
  readonly outroStartBeat: number;
  readonly endBeat: number;
  readonly beatSec: number;
  readonly usedDetectedDrop: boolean;
  readonly warnings: readonly string[];
}

const nearestBy = <T>(items: readonly T[], score: (t: T) => number): T | undefined =>
  items.reduce<T | undefined>((best, x) => (best === undefined || score(x) < score(best) ? x : best), undefined);

/**
 * Chooses where the music starts (a downbeat), where the video ends (the beat
 * nearest to the target length) and where the top play lands (the strongest drop that fits).
 */
export function resolveWindow(beatmap: Beatmap, targetSec: number, rules: StyleRules): TimelineWindow {
  const beats = beatmap.beats;
  const beatSec = 60 / beatmap.bpm;
  const downbeats = beatmap.downbeatIndices;
  const minPreBeats = rules.introBars * BAR + 2 * rules.minBeats;
  const warnings: string[] = [];

  const strongest = beatmap.drops[0];
  const desiredDropOffset = targetSec * rules.dropPosition;
  const startCandidates = downbeats.filter((d) => {
    const lastNeeded = beats[d]! + targetSec - beatSec / 2;
    return beats[beats.length - 1]! >= lastNeeded;
  });
  if (startCandidates.length === 0) {
    const musicLen = beats[beats.length - 1]! - beats[0]!;
    throw new SolverError(
      `Music too short: need ~${targetSec}s of beats from a downbeat, track only has ${musicLen.toFixed(1)}s`,
      "MUSIC_TOO_SHORT",
    );
  }

  const frameFor = (startBeat: number) => {
    const endBeat = nearestBy(
      beats.map((_, i) => i).filter((i) => i > startBeat),
      (i) => Math.abs(beats[i]! - beats[startBeat]! - targetSec),
    )!;
    return { startBeat, endBeat, introEndBeat: startBeat + rules.introBars * BAR, outroStartBeat: endBeat - rules.outroBars * BAR };
  };
  type Frame = ReturnType<typeof frameFor>;
  const minTopAndPost = rules.dropBeats / 2 + rules.minBeats;
  const dropFits = (f: Frame, d: number): boolean =>
    d - f.introEndBeat >= 2 * rules.minBeats && f.outroStartBeat - d >= minTopAndPost;

  // Try drops strongest-first; the first one that fits the window wins.
  const fitted = beatmap.drops
    .map((drop) => {
      const starts = startCandidates.filter((s) => drop.beatIndex - s >= minPreBeats);
      if (starts.length === 0) return undefined;
      const s = nearestBy(starts, (c) => Math.abs(beats[drop.beatIndex]! - beats[c]! - desiredDropOffset))!;
      const frame = frameFor(s);
      return dropFits(frame, drop.beatIndex) ? { drop, frame } : undefined;
    })
    .find((x) => x !== undefined);

  if (fitted) {
    if (fitted.drop !== strongest) {
      warnings.push(
        `Biggest drop (${strongest!.time.toFixed(2)}s) does not fit the ${targetSec}s window; using the next strongest at ${fitted.drop.time.toFixed(2)}s`,
      );
    }
    return Object.freeze({
      ...fitted.frame, dropBeat: fitted.drop.beatIndex, beatSec, usedDetectedDrop: true, warnings: Object.freeze(warnings),
    });
  }

  const frame = frameFor(startCandidates[0]!);
  const desired = frame.startBeat + (frame.endBeat - frame.startBeat) * rules.dropPosition;
  const fallback = nearestBy(downbeats.filter((d) => dropFits(frame, d)), (d) => Math.abs(d - desired));
  if (fallback === undefined) {
    throw new SolverError(`Target duration ${targetSec}s is too short for intro, build, drop and outro`, "MUSIC_TOO_SHORT");
  }
  warnings.push(
    strongest
      ? `No detected drop fits the ${targetSec}s window; top play placed on downbeat at ${beats[fallback]!.toFixed(2)}s`
      : `No drop detected in the music; top play placed on downbeat at ${beats[fallback]!.toFixed(2)}s`,
  );
  return Object.freeze({
    ...frame, dropBeat: fallback, beatSec, usedDetectedDrop: false, warnings: Object.freeze(warnings),
  });
}
