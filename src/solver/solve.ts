import type { EditorialPlan, EditorialPlanner, PlannerInput } from "../planner/editorial-planner.js";
import { validatePlan } from "../planner/editorial-planner.js";
import type { Beatmap } from "../schema/beatmap.js";
import { FORMATS, type InputManifest } from "../schema/input-manifest.js";
import {
  RENDER_MANIFEST_VERSION,
  RenderManifestSchema,
  type RenderManifest,
  type Segment,
} from "../schema/render-manifest.js";
import { FPS } from "../constants.js";
import { alignKeyPlays } from "./align.js";
import { assertInvariants } from "./invariants.js";
import { layoutSlots } from "./layout.js";
import { END_SAFETY_SEC, SolverError, STYLE_RULES, usableSeconds, type ClipInfo, type Slot } from "./types.js";
import { resolveWindow, type TimelineWindow } from "./window.js";

export const RENDER_FPS = FPS;

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** Rounds up to the millisecond, so a rounded sourceStart never precedes the inPoint. */
const ceil3 = (v: number): number => Math.ceil(v * 1000 - 1e-6) / 1000;

export interface SolveInput {
  readonly manifest: InputManifest;
  readonly clips: readonly ClipInfo[];
  readonly beatmap: Beatmap;
  readonly musicSrc: string;
  readonly plan: EditorialPlan;
  readonly plannerName: string;
  readonly window: TimelineWindow;
}

export function shotBudget(win: TimelineWindow, manifest: InputManifest): PlannerInput["budget"] {
  const rules = STYLE_RULES[manifest.style];
  const pre = Math.max(1, Math.floor((win.dropBeat - win.introEndBeat) / rules.targetBeats));
  const postBeats = Math.max(0, win.outroStartBeat - win.dropBeat - rules.dropBeats);
  const post = Math.max(1, Math.floor(postBeats / rules.targetBeats));
  const preSeconds = r3((win.dropBeat - win.introEndBeat) * win.beatSec);
  return { pre, post, preSeconds, postSeconds: r3(postBeats * win.beatSec) };
}

function toSegment(slot: Slot, frameOf: (beat: number) => number, downbeats: ReadonlySet<number>, dropBeat: number): Segment {
  const fromFrame = frameOf(slot.startBeat);
  const durationInFrames = frameOf(slot.endBeat) - fromFrame;
  if (durationInFrames <= 0) throw new SolverError(`Empty shot for ${slot.clip.id}`, "INVARIANT");
  const sourceDuration = (durationInFrames / RENDER_FPS) * slot.playbackRate;
  const { usableStart, usableEnd } = slot.clip;
  const sourceStart = Math.max(usableStart, usableEnd - sourceDuration - END_SAFETY_SEC / 2);
  if (sourceStart + sourceDuration > usableEnd + 1e-6) {
    throw new SolverError(`Shot for ${slot.clip.id} would exceed its usable footage`, "INVARIANT");
  }
  return {
    clipId: slot.clip.id,
    src: slot.clip.src,
    player: slot.clip.player,
    event: slot.clip.event,
    importance: slot.clip.importance,
    role: slot.role,
    fromFrame,
    durationInFrames,
    sourceStart: ceil3(sourceStart),
    sourceDuration: r3(sourceDuration),
    playbackRate: slot.playbackRate,
    startsOnDownbeat: downbeats.has(slot.startBeat),
    isDrop: slot.startBeat === dropBeat,
  };
}

/** Pure: validated plan + beatmap + clip bounds -> frame-accurate, versioned render manifest. */
export function solveTimeline(input: SolveInput): RenderManifest {
  const { manifest, beatmap, window: win, plan } = input;
  const rules = STYLE_RULES[manifest.style];
  const clipsById = new Map(input.clips.map((c) => [c.id, c]));
  const downbeats = new Set(beatmap.downbeatIndices);
  // Quantise the music start to the frame grid: Remotion trims audio in whole
  // frames, so an unquantised start would shift every beat by up to half a frame.
  const t0 = Math.round(beatmap.beats[win.startBeat]! * RENDER_FPS) / RENDER_FPS;
  const frameOf = (beat: number): number => Math.round((beatmap.beats[beat]! - t0) * RENDER_FPS);

  const laid = layoutSlots(plan, clipsById, win, rules);
  const aligned = alignKeyPlays(laid.slots, downbeats, rules, win.beatSec);
  const segments = aligned.slots.map((s) => toSegment(s, frameOf, downbeats, win.dropBeat));
  const durationInFrames = frameOf(win.endBeat);
  const beatRange = beatmap.beats.map((_, i) => i).filter((i) => i >= win.startBeat && i < win.endBeat);
  const planWarnings = plan.dropped.length ? [`Planner dropped ${plan.dropped.length} clip(s): ${plan.dropped.join(", ")}`] : [];
  const introFrames = frameOf(win.introEndBeat);
  const outroFrom = frameOf(win.outroStartBeat);

  const result = RenderManifestSchema.parse({
    version: RENDER_MANIFEST_VERSION,
    fps: RENDER_FPS,
    ...FORMATS[manifest.format],
    format: manifest.format,
    style: manifest.style,
    durationInFrames,
    targetDuration: manifest.targetDuration,
    music: { src: input.musicSrc, startAt: t0, bpm: beatmap.bpm },
    intro: { fromFrame: 0, durationInFrames: introFrames, title: manifest.title, subtitle: manifest.subtitle },
    outro: { fromFrame: outroFrom, durationInFrames: durationInFrames - outroFrom, title: manifest.title, subtitle: manifest.outroText },
    segments,
    beatFrames: beatRange.map(frameOf),
    downbeatFrames: beatRange.filter((i) => downbeats.has(i)).map(frameOf),
    dropFrames: beatmap.drops.filter((d) => d.beatIndex >= win.startBeat && d.beatIndex < win.endBeat).map((d) => frameOf(d.beatIndex)),
    planner: input.plannerName,
    warnings: [...win.warnings, ...planWarnings, ...laid.warnings, ...aligned.warnings],
  });
  assertInvariants(result, input.clips);
  return result;
}

/** Stage 4 end to end: window -> planner (validated) -> solver. */
export async function planAndSolve(
  args: Omit<SolveInput, "plan" | "plannerName" | "window">,
  planner: EditorialPlanner,
): Promise<{ manifest: RenderManifest; plan: EditorialPlan }> {
  const rules = STYLE_RULES[args.manifest.style];
  const win = resolveWindow(args.beatmap, args.manifest.targetDuration, rules);
  const plannerInput: PlannerInput = {
    clips: args.clips.map((c) => ({ id: c.id, player: c.player, event: c.event, importance: c.importance, usableSeconds: r3(usableSeconds(c)) })),
    style: args.manifest.style,
    budget: shotBudget(win, args.manifest),
  };
  const plan = validatePlan(await planner.plan(plannerInput), args.clips.map((c) => c.id));
  const manifest = solveTimeline({ ...args, plan, plannerName: planner.name, window: win });
  return { manifest, plan };
}
