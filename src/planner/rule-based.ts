import type { EditorialPlan, EditorialPlanner, PlannerClip, PlannerInput } from "./editorial-planner.js";

const FOOTAGE_MARGIN = 1.2;

/** Strongest first: importance, then longer footage, then id (fully deterministic). */
export const byStrength = (a: PlannerClip, b: PlannerClip): number =>
  b.importance - a.importance || b.usableSeconds - a.usableSeconds || a.id.localeCompare(b.id);

/** Weakest first, used for the "build": energy rises toward the drop. */
const byRising = (a: PlannerClip, b: PlannerClip): number => -byStrength(a, b);

/**
 * Default, deterministic story structure used by highlight editors:
 *   opener  = 3rd-strongest play (a hook, but not the best)
 *   build   = weaker plays, rising in importance, up to the drop
 *   top     = strongest play, lands on the biggest drop
 *   after   = remaining strong plays keep the energy up
 *   closer  = 2nd-strongest play, the last thing the viewer remembers
 * Plays beyond the shot budget are dropped (weakest first), unless the
 * remaining footage would be too short to fill the timeline.
 */
export function ruleBasedPlan(input: PlannerInput): EditorialPlan {
  const ranked = [...input.clips].sort(byStrength);
  const [top, closer, opener, ...rest] = ranked;
  if (!top || !closer || !opener) throw new Error("Rule-based planner needs at least 3 clips");

  const { preSeconds, postSeconds } = input.budget;
  const preShare = preSeconds + postSeconds > 0 ? preSeconds / (preSeconds + postSeconds) : 1;
  const seconds = (cs: readonly PlannerClip[]): number => cs.reduce((sum, c) => sum + c.usableSeconds, 0);
  const split = (keep: number) => {
    const rising = rest.slice(0, keep).sort(byRising);
    const buildCount = Math.min(rising.length, Math.round(rising.length * preShare));
    return { build: rising.slice(0, buildCount), afterDrop: rising.slice(buildCount) };
  };
  // Footage is short in a region if it can't cover that region's time with a
  // margin (shots snap to whole beats, so not every second of footage is usable).
  const short = ({ build, afterDrop }: ReturnType<typeof split>): boolean =>
    seconds([opener, ...build]) < preSeconds * FOOTAGE_MARGIN || seconds([...afterDrop, closer]) < postSeconds * FOOTAGE_MARGIN;

  // Start from the shot budget; add plays while either region would need slow-mo stretching.
  let keep = Math.min(rest.length, Math.max(0, input.budget.pre - 1) + Math.max(0, input.budget.post - 1));
  while (keep < rest.length && short(split(keep))) keep++;
  const chosen = split(keep);
  const build = chosen.build.map((c) => c.id);
  const afterDrop = chosen.afterDrop.map((c) => c.id);
  const dropped = rest.slice(keep).map((c) => c.id);

  return {
    opener: opener.id,
    build,
    top: top.id,
    afterDrop,
    closer: closer.id,
    dropped,
    rationale:
      `Top play ${top.id} on the drop; ${closer.id} closes; ${opener.id} opens. ` +
      `${build.length} build shots rise into the drop, ${afterDrop.length} keep energy after it` +
      (dropped.length ? `; dropped ${dropped.length} weakest (${dropped.join(", ")}) to fit the shot budget.` : "."),
  };
}

export class RuleBasedPlanner implements EditorialPlanner {
  readonly name = "rule-based@1";

  plan(input: PlannerInput): Promise<unknown> {
    return Promise.resolve(ruleBasedPlan(input));
  }
}
