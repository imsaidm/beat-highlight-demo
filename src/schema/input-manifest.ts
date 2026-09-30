import { z } from "zod";

/** Output formats and their pixel dimensions. */
export const FORMATS = Object.freeze({
  vertical: Object.freeze({ width: 1080, height: 1920 }),
  square: Object.freeze({ width: 1080, height: 1080 }),
  landscape: Object.freeze({ width: 1920, height: 1080 }),
});

export const FormatSchema = z.enum(["vertical", "square", "landscape"]);
export const StyleSchema = z.enum(["hype", "recruiting"]);

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export const ClipSchema = z
  .object({
    id: z.string().regex(SAFE_ID, "id must be 1-64 chars of [a-zA-Z0-9_-]"),
    file: z.string().min(1, "file is required"),
    player: z.string().min(1).max(60),
    event: z.string().min(1).max(40),
    importance: z.number().int().min(1).max(5),
    inPoint: z.number().min(0).optional(),
    outPoint: z.number().positive().optional(),
  })
  .strict()
  .refine((c) => c.inPoint === undefined || c.outPoint === undefined || c.outPoint > c.inPoint, {
    message: "outPoint must be greater than inPoint",
    path: ["outPoint"],
  });

export const InputManifestSchema = z
  .object({
    title: z.string().min(1).max(60).default("SEASON HIGHLIGHTS"),
    subtitle: z.string().max(80).default(""),
    outroText: z.string().max(80).default("THANKS FOR WATCHING"),
    clips: z.array(ClipSchema).min(3, "at least 3 clips are required (opener, top play, closer)").max(60),
    music: z.string().min(1, "music file is required"),
    style: StyleSchema,
    format: FormatSchema,
    targetDuration: z.number().min(10).max(180).default(30),
  })
  .strict()
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    m.clips.forEach((c, i) => {
      if (seen.has(c.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate clip id "${c.id}"`, path: ["clips", i, "id"] });
      }
      seen.add(c.id);
    });
  });

export type Clip = z.infer<typeof ClipSchema>;
export type InputManifest = z.infer<typeof InputManifestSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type Style = z.infer<typeof StyleSchema>;

export class ManifestValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

/** Formats zod issues as `path: message` lines. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
}

/** Parses unknown JSON into a validated, frozen input manifest or throws a readable error. */
export function parseInputManifest(raw: unknown): InputManifest {
  const result = InputManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = formatIssues(result.error);
    throw new ManifestValidationError(`Invalid input manifest:\n  - ${issues.join("\n  - ")}`, issues);
  }
  return deepFreeze(result.data);
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
