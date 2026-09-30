import { z } from "zod";
import type { Style } from "../schema/input-manifest.js";
import { SolverError } from "../solver/types.js";

/**
 * Stage 4 extension point. An EditorialPlanner decides the *story*
 * (which plays, in which order, which one is the top play). The timeline
 * solver then does the *math* (beat snapping, durations, clip bounds).
 *
 * Any implementation - rule-based, or an LLM reading scouting notes - must
 * return JSON that passes `EditorialPlanSchema` + `validatePlan`, otherwise
 * the pipeline refuses it. The solver never trusts a plan it did not validate.
 */
export interface PlannerClip {
  readonly id: string;
  readonly player: string;
  readonly event: string;
  readonly importance: number;
  readonly usableSeconds: number;
}

export interface PlannerInput {
  readonly clips: readonly PlannerClip[];
  readonly style: Style;
  /**
   * Approximate number of shots that fit before / after the drop (each including
   * opener / closer), and the seconds of footage those regions must fill.
   */
  readonly budget: {
    readonly pre: number;
    readonly post: number;
    readonly preSeconds: number;
    readonly postSeconds: number;
  };
}

export const EditorialPlanSchema = z
  .object({
    opener: z.string(),
    build: z.array(z.string()),
    top: z.string(),
    afterDrop: z.array(z.string()),
    closer: z.string(),
    dropped: z.array(z.string()).default([]),
    rationale: z.string().max(2000).default(""),
  })
  .strict();

export type EditorialPlan = z.infer<typeof EditorialPlanSchema>;

export interface EditorialPlanner {
  readonly name: string;
  plan(input: PlannerInput): Promise<unknown>;
}

/** Schema + semantic validation (known ids, no duplicates, every clip accounted for). */
export function validatePlan(raw: unknown, clipIds: readonly string[]): EditorialPlan {
  const parsed = EditorialPlanSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new SolverError(`Editorial plan failed schema validation: ${issues.join("; ")}`, "INVALID_PLAN");
  }
  const plan = parsed.data;
  const used = [plan.opener, ...plan.build, plan.top, ...plan.afterDrop, plan.closer];
  const known = new Set(clipIds);
  const unknown = [...used, ...plan.dropped].filter((id) => !known.has(id));
  if (unknown.length) throw new SolverError(`Editorial plan references unknown clips: ${unknown.join(", ")}`, "INVALID_PLAN");
  const all = [...used, ...plan.dropped];
  const dupes = all.filter((id, i) => all.indexOf(id) !== i);
  if (dupes.length) throw new SolverError(`Editorial plan uses clips more than once: ${[...new Set(dupes)].join(", ")}`, "INVALID_PLAN");
  const missing = clipIds.filter((id) => !all.includes(id));
  if (missing.length) throw new SolverError(`Editorial plan does not account for clips: ${missing.join(", ")}`, "INVALID_PLAN");
  return plan;
}
