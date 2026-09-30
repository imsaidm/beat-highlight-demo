import type { EditorialPlan } from "../planner/editorial-planner.js";
import { allocateBeats } from "./allocate.js";
import { maxBeatsFor, SolverError, usableSeconds, type ClipInfo, type Role, type Slot, type StyleRules } from "./types.js";
import type { TimelineWindow } from "./window.js";

export interface Region {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly entries: readonly { readonly clip: ClipInfo; readonly role: Role }[];
  /** Roles that must never be dropped from this region. */
  readonly pinned: ReadonlySet<Role>;
}

interface RegionResult {
  readonly slots: readonly Slot[];
  readonly warnings: readonly string[];
}

type Entry = Region["entries"][number];

/** Index of the lowest-importance non-pinned entry matching `eligible`, or -1. */
const weakestDroppable = (region: Region, eligible: (e: Entry) => boolean = () => true): number => {
  let idx = -1;
  region.entries.forEach((e, i) => {
    if (region.pinned.has(e.role) || !eligible(e)) return;
    if (idx < 0 || e.clip.importance <= region.entries[idx]!.clip.importance) idx = i;
  });
  return idx;
};

/** Fills [start, end) with the region's clips; drops weakest clips if too many, slows footage if too short. */
export function fillRegion(region: Region, rules: StyleRules, beatSec: number): RegionResult {
  const total = region.end - region.start;
  const rates = [1, ...rules.stretchRates];
  const warnings: string[] = [];
  let current = region;

  for (;;) {
    for (const rate of rates) {
      const items = current.entries.map((e) => ({
        min: rules.minBeats,
        max: maxBeatsFor(e.clip, beatSec, rate),
        weight: e.clip.importance,
      }));
      const alloc = allocateBeats(total, items, rules.unitBeats);
      if (!alloc) continue;
      if (rate < 1) warnings.push(`${region.name}: footage too short, slowed to ${rate}x to fill ${total} beats`);
      let cursor = current.start;
      const slots = current.entries.map((e, i): Slot => {
        const slot = { clip: e.clip, role: e.role, startBeat: cursor, endBeat: cursor + alloc[i]!, playbackRate: rate };
        cursor += alloc[i]!;
        return slot;
      });
      return { slots, warnings };
    }

    const slowest = rates[rates.length - 1]!;
    const minSum = current.entries.length * rules.minBeats;
    const unusable = (e: Entry): boolean => maxBeatsFor(e.clip, beatSec, slowest) < rules.minBeats;
    const pinnedUnusable = current.entries.find((e) => current.pinned.has(e.role) && unusable(e));
    if (pinnedUnusable) {
      throw new SolverError(
        `${region.name}: ${pinnedUnusable.role} ${pinnedUnusable.clip.id} is too short (${usableSeconds(pinnedUnusable.clip).toFixed(2)}s usable) ` +
          `to fill even ${rules.minBeats} beats at ${slowest}x. Use a longer clip or widen its inPoint/outPoint.`,
        "INSUFFICIENT_FOOTAGE",
      );
    }
    // An unusable (too short) clip is dropped first, whatever its importance;
    // only when there are simply too many clips does the weakest one go.
    const unusableVictim = weakestDroppable(current, unusable);
    const victim = unusableVictim >= 0 ? unusableVictim : minSum > total ? weakestDroppable(current) : -1;
    if (victim >= 0) {
      const dropped = current.entries[victim]!;
      const reason = unusableVictim >= 0 ? `footage too short for a ${rules.minBeats}-beat shot` : `too many clips for ${total} beats`;
      warnings.push(`${region.name}: dropped ${dropped.clip.id} (importance ${dropped.clip.importance}) - ${reason}`);
      current = { ...current, entries: current.entries.filter((_, i) => i !== victim) };
      continue;
    }
    const covered = current.entries.reduce((a, e) => a + maxBeatsFor(e.clip, beatSec, slowest), 0);
    throw new SolverError(
      `Insufficient footage for ${region.name}: need ${total} beats (${(total * beatSec).toFixed(1)}s) ` +
        `but ${current.entries.length} clip(s) cover only ${covered} beats even at ${slowest}x. Add clips or lower targetDuration.`,
      "INSUFFICIENT_FOOTAGE",
    );
  }
}

/** Beat length of the top play: as long as the style wants, bounded by footage and the post-drop room. */
export function topBeats(top: ClipInfo, win: TimelineWindow, rules: StyleRules): number {
  const room = win.outroStartBeat - win.dropBeat - rules.minBeats;
  const raw = Math.min(rules.dropBeats, maxBeatsFor(top, win.beatSec, rules.dropPlaybackRate), room);
  const barAligned = raw >= 4 ? raw - (raw % 4) : raw;
  if (barAligned < rules.minBeats) {
    throw new SolverError(`Top play ${top.id} is too short to hold the drop (${barAligned} beats)`, "INSUFFICIENT_FOOTAGE");
  }
  return barAligned;
}

export function layoutSlots(
  plan: EditorialPlan,
  clips: ReadonlyMap<string, ClipInfo>,
  win: TimelineWindow,
  rules: StyleRules,
): { slots: Slot[]; warnings: string[] } {
  const get = (id: string): ClipInfo => {
    const c = clips.get(id);
    if (!c) throw new SolverError(`Unknown clip ${id}`, "INVALID_PLAN");
    return c;
  };
  const top = get(plan.top);
  const topLen = topBeats(top, win, rules);
  const pre = fillRegion(
    {
      name: "pre-drop",
      start: win.introEndBeat,
      end: win.dropBeat,
      entries: [{ clip: get(plan.opener), role: "opener" }, ...plan.build.map((id) => ({ clip: get(id), role: "build" as const }))],
      pinned: new Set<Role>(["opener"]),
    },
    rules,
    win.beatSec,
  );
  const post = fillRegion(
    {
      name: "post-drop",
      start: win.dropBeat + topLen,
      end: win.outroStartBeat,
      entries: [...plan.afterDrop.map((id) => ({ clip: get(id), role: "afterDrop" as const })), { clip: get(plan.closer), role: "closer" }],
      pinned: new Set<Role>(["closer"]),
    },
    rules,
    win.beatSec,
  );
  const topSlot: Slot = { clip: top, role: "top", startBeat: win.dropBeat, endBeat: win.dropBeat + topLen, playbackRate: rules.dropPlaybackRate };
  return { slots: [...pre.slots, topSlot, ...post.slots], warnings: [...pre.warnings, ...post.warnings] };
}
