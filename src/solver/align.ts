import { maxBeatsFor, type Slot, type StyleRules } from "./types.js";

const fits = (s: Slot, len: number, rules: StyleRules, beatSec: number): boolean =>
  len >= rules.minBeats && len <= maxBeatsFor(s.clip, beatSec, s.playbackRate);

/**
 * Moves the cut in front of every importance-5 play onto the nearest downbeat
 * (by resizing it and its predecessor) when both stay within their bounds.
 * Region boundaries (intro end, drop, outro start) are never moved.
 */
export function alignKeyPlays(
  slots: readonly Slot[],
  downbeats: ReadonlySet<number>,
  rules: StyleRules,
  beatSec: number,
): { slots: Slot[]; warnings: string[] } {
  const warnings: string[] = [];
  const out = [...slots];
  for (let i = 1; i < out.length; i++) {
    const cur = out[i]!;
    const prev = out[i - 1]!;
    if (cur.clip.importance < 5 || downbeats.has(cur.startBeat) || prev.endBeat !== cur.startBeat) continue;
    if (cur.role === "top" || prev.role === "top") continue;

    const later = [...Array(4).keys()].map((k) => k + 1).find((d) => downbeats.has(cur.startBeat + d));
    const earlier = [...Array(4).keys()].map((k) => k + 1).find((d) => downbeats.has(cur.startBeat - d));
    const moves = [
      ...(later !== undefined ? [later] : []),
      ...(earlier !== undefined ? [-earlier] : []),
    ].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b); // tie -> move earlier, so the key play grows

    const move = moves.find((d) => {
      const prevLen = prev.endBeat - prev.startBeat + d;
      const curLen = cur.endBeat - cur.startBeat - d;
      return fits(prev, prevLen, rules, beatSec) && fits(cur, curLen, rules, beatSec);
    });
    if (move === undefined) {
      warnings.push(`Could not move ${cur.clip.id} onto a downbeat without breaking clip bounds`);
      continue;
    }
    out[i - 1] = { ...prev, endBeat: prev.endBeat + move };
    out[i] = { ...cur, startBeat: cur.startBeat + move };
  }
  return { slots: out, warnings };
}
