import { parseArgs } from "node:util";
import { FormatSchema, StyleSchema, type Format, type Style } from "../schema/input-manifest.js";

export interface CliArgs {
  readonly manifest: string;
  readonly outDir: string;
  readonly format?: Format;
  readonly style?: Style;
  readonly skipRender: boolean;
}

export const USAGE = `Usage: npm run make -- --manifest input/manifest.json [--format vertical|square|landscape] [--style hype|recruiting] [--out out] [--skip-render]`;

/** Parses and validates CLI flags; throws with usage text on bad input. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        manifest: { type: "string", short: "m" },
        out: { type: "string", short: "o", default: "out" },
        format: { type: "string", short: "f" },
        style: { type: "string", short: "s" },
        "skip-render": { type: "boolean", default: false },
      },
      strict: true,
    }));
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  if (!values.manifest) throw new Error(`--manifest is required\n${USAGE}`);
  const format = values.format === undefined ? undefined : FormatSchema.safeParse(values.format);
  if (format && !format.success) throw new Error(`--format must be one of vertical|square|landscape\n${USAGE}`);
  const style = values.style === undefined ? undefined : StyleSchema.safeParse(values.style);
  if (style && !style.success) throw new Error(`--style must be one of hype|recruiting\n${USAGE}`);
  return Object.freeze({
    manifest: values.manifest,
    outDir: values.out ?? "out",
    format: format?.data,
    style: style?.data,
    skipRender: values["skip-render"] ?? false,
  });
}
