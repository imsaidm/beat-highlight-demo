/**
 * Generates copyright-free demo media with ffmpeg:
 *   input/media/music.wav      - synthetic 120 BPM groove with a drop at 16s
 *   input/media/clips/*.mp4    - 10 synthetic "plays" (mixed fps/resolutions on purpose)
 *   input/manifest.json        - sample input manifest referencing them
 *
 * Usage: npm run samples
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { run } from "../src/media/exec.js";
import { CLIPS, DEFAULT_MUSIC, clipArgs, musicArgs } from "./sample-specs.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const INPUT = path.join(ROOT, "input");
const MEDIA = path.join(INPUT, "media");

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/Library/Fonts/Arial Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

function findFont(): string {
  const fromEnv = process.env.SAMPLE_FONT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const found = FONT_CANDIDATES.find((f) => existsSync(f));
  if (!found) throw new Error("No bold TTF font found. Set SAMPLE_FONT=/path/to/font.ttf and re-run.");
  return found;
}

async function main(): Promise<void> {
  const font = findFont();
  await mkdir(path.join(MEDIA, "clips"), { recursive: true });

  const musicFile = path.join(MEDIA, "music.wav");
  console.log(`[samples] music: ${DEFAULT_MUSIC.bpm} BPM, drop at ${DEFAULT_MUSIC.dropAt}s -> ${path.relative(ROOT, musicFile)}`);
  await run("ffmpeg", musicArgs(DEFAULT_MUSIC, musicFile));

  for (const c of CLIPS) {
    const out = path.join(MEDIA, "clips", `${c.id}.mp4`);
    console.log(`[samples] clip ${c.id} (${c.width}x${c.height}@${c.fps}fps, ${c.duration}s)`);
    await run("ffmpeg", clipArgs(c, font, out));
  }

  const manifest = {
    title: "RIVERSIDE HAWKS",
    subtitle: "2026 Season Highlights",
    style: "hype",
    format: "vertical",
    targetDuration: 30,
    music: "media/music.wav",
    clips: CLIPS.map((c) => ({
      id: c.id,
      file: `media/clips/${c.id}.mp4`,
      player: `#${c.number} ${c.player}`,
      event: c.event.toLowerCase(),
      importance: c.importance,
      ...(c.inPoint !== undefined ? { inPoint: c.inPoint } : {}),
      ...(c.outPoint !== undefined ? { outPoint: c.outPoint } : {}),
    })),
  };
  await writeFile(path.join(INPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[samples] wrote input/manifest.json with ${CLIPS.length} clips`);
}

main().catch((err: unknown) => {
  console.error(`[samples] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
