/**
 * End-to-end pipeline:
 *   manifest -> probe/normalise -> beat analysis -> planner + timeline solver -> Remotion render -> QA
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeFile } from "../beat/analyze.js";
import { RuleBasedPlanner } from "../planner/rule-based.js";
import { runQa } from "../qa/run-qa.js";
import { renderHighlight } from "../render/render.js";
import { parseInputManifest, type InputManifest } from "../schema/input-manifest.js";
import { planAndSolve } from "../solver/solve.js";
import { parseCliArgs } from "./args.js";
import { ingest } from "./ingest.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MEZZ_DIR = path.join(ROOT, "mezzanine");

const log = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

async function timed<T>(label: string, timings: Record<string, number>, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  log(`\n== ${label}`);
  const result = await fn();
  timings[label] = Math.round(performance.now() - t0);
  log(`   done in ${(timings[label]! / 1000).toFixed(1)}s`);
  return result;
}

async function loadManifest(file: string, overrides: Partial<Pick<InputManifest, "format" | "style">>): Promise<InputManifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`Cannot read manifest ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const base = raw && typeof raw === "object" ? raw : {};
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
  return parseInputManifest({ ...base, ...defined });
}

const writeJson = (file: string, data: unknown): Promise<void> => writeFile(file, `${JSON.stringify(data, null, 2)}\n`);

async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifest);
  const outDir = path.resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const timings: Record<string, number> = {};

  const manifest = await timed("1. validate manifest", timings, async () => {
    const m = await loadManifest(manifestPath, { format: args.format, style: args.style });
    log(`   ${m.clips.length} clips, style=${m.style}, format=${m.format}, target=${m.targetDuration}s`);
    return m;
  });

  const media = await timed("2. probe + normalise", timings, async () => {
    const r = await ingest(manifest, path.dirname(manifestPath), MEZZ_DIR);
    r.log.forEach((l) => log(`   ${l}`));
    return r;
  });

  const beatmap = await timed("3. beat analysis", timings, async () => {
    const b = await analyzeFile(media.music.file);
    log(`   ${b.bpm} BPM (confidence ${b.tempoConfidence}), ${b.beats.length} beats, drops at ${b.drops.map((d) => `${d.time.toFixed(2)}s`).join(", ") || "none"}`);
    await writeJson(path.join(outDir, "beatmap.json"), b);
    return b;
  });

  const { manifest: renderManifest } = await timed("4. editorial plan + timeline solve", timings, async () => {
    const r = await planAndSolve({ manifest, clips: media.clips, beatmap, musicSrc: media.music.publicPath }, new RuleBasedPlanner());
    log(`   plan: ${r.plan.rationale}`);
    r.manifest.segments.forEach((s) =>
      log(`   ${String(s.fromFrame).padStart(4)}f +${String(s.durationInFrames).padStart(3)}f  ${s.role.padEnd(9)} ${s.clipId.padEnd(14)} x${s.playbackRate}${s.isDrop ? "  <- DROP" : ""}`),
    );
    r.manifest.warnings.forEach((w) => log(`   WARN ${w}`));
    await writeJson(path.join(outDir, "editorial-plan.json"), r.plan);
    await writeJson(path.join(outDir, "render-manifest.json"), r.manifest);
    return r;
  });

  if (args.skipRender) {
    log("\n--skip-render: stopping after the solver.");
    return 0;
  }

  const outFile = path.join(outDir, `highlight-${manifest.format}.mp4`);
  await timed("5. render (Remotion)", timings, async () => {
    let lastPct = -10;
    await renderHighlight({
      manifest: renderManifest,
      publicDir: MEZZ_DIR,
      outFile,
      onProgress: (p) => {
        const pct = Math.floor(p * 100);
        if (pct >= lastPct + 10) {
          lastPct = pct;
          log(`   ${pct}%`);
        }
      },
    });
    log(`   ${path.relative(ROOT, outFile)} (${((await stat(outFile)).size / 1e6).toFixed(2)} MB)`);
  });

  const report = await timed("6. automated QA", timings, async () => {
    const r = await runQa(outFile, renderManifest);
    r.checks.forEach((c) => log(`   ${c.passed ? "PASS" : "FAIL"} ${c.name.padEnd(20)} expected ${c.expected}, got ${c.actual}`));
    return r;
  });
  await writeJson(path.join(outDir, "qa-report.json"), { ...report, timingsMs: timings });

  if (!report.passed) {
    const failed = report.checks.filter((c) => !c.passed).map((c) => c.name);
    process.stderr.write(`\nQA FAILED: ${failed.join(", ")} (see ${path.relative(ROOT, path.join(outDir, "qa-report.json"))})\n`);
    return 2;
  }
  log(`\nQA PASSED. Output: ${path.relative(ROOT, outFile)}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(`\nPIPELINE FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
