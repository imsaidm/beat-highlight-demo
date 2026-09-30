import type { RenderManifest } from "../schema/render-manifest.js";
import { SolverError, type ClipInfo } from "./types.js";

const EPS = 1e-6;

/**
 * Last line of defence before rendering: the manifest must tile the timeline
 * exactly (intro -> shots -> outro, no gaps/overlaps) and every shot must stay
 * inside its clip's usable footage. Throws SolverError("INVARIANT").
 */
export function assertInvariants(m: RenderManifest, clips: readonly ClipInfo[]): void {
  const fail = (msg: string): never => {
    throw new SolverError(`Render manifest invariant violated: ${msg}`, "INVARIANT");
  };
  const byId = new Map(clips.map((c) => [c.id, c]));

  if (m.intro.fromFrame !== 0) fail(`intro starts at frame ${m.intro.fromFrame}, expected 0`);
  let cursor = m.intro.durationInFrames;
  for (const s of m.segments) {
    if (s.fromFrame !== cursor) fail(`${s.clipId} starts at frame ${s.fromFrame}, expected ${cursor}`);
    if (s.durationInFrames <= 0) fail(`${s.clipId} has no frames`);
    const c = byId.get(s.clipId) ?? fail(`${s.clipId} is not a known clip`);
    if (s.sourceStart < c.usableStart - EPS) fail(`${s.clipId} starts before its inPoint`);
    if (s.sourceStart + s.sourceDuration > c.usableEnd + EPS) fail(`${s.clipId} runs past its usable footage`);
    const expected = (s.durationInFrames / m.fps) * s.playbackRate;
    if (Math.abs(s.sourceDuration - expected) > 1e-3) fail(`${s.clipId} sourceDuration does not match its frames x rate`);
    cursor += s.durationInFrames;
  }
  if (m.outro.fromFrame !== cursor) fail(`outro starts at frame ${m.outro.fromFrame}, expected ${cursor}`);
  if (m.outro.fromFrame + m.outro.durationInFrames !== m.durationInFrames) {
    fail(`outro ends at frame ${m.outro.fromFrame + m.outro.durationInFrames}, video has ${m.durationInFrames}`);
  }
}
