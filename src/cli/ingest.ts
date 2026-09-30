import { existsSync } from "node:fs";
import path from "node:path";
import { normalizeClip, normalizeMusic, type NormalizedClip } from "../media/normalize.js";
import { probe } from "../media/probe.js";
import type { Clip, InputManifest } from "../schema/input-manifest.js";
import type { ClipInfo } from "../solver/types.js";

export interface IngestResult {
  readonly clips: readonly ClipInfo[];
  readonly music: NormalizedClip;
  readonly log: readonly string[];
}

function resolveMedia(manifestDir: string, file: string, what: string): string {
  const abs = path.resolve(manifestDir, file);
  if (!existsSync(abs)) throw new Error(`${what} not found: ${file} (resolved to ${abs})`);
  return abs;
}

/** Pure: clamp inPoint/outPoint to the real duration and collect warnings. */
export function usableRange(clip: Clip, duration: number): { start: number; end: number; warning?: string } {
  const start = Math.min(clip.inPoint ?? 0, duration);
  const end = Math.min(clip.outPoint ?? duration, duration);
  const warning =
    clip.outPoint !== undefined && clip.outPoint > duration + 1e-3
      ? `${clip.id}: outPoint ${clip.outPoint}s is past the clip end (${duration.toFixed(2)}s); clamped`
      : undefined;
  if (end - start < 0.5) throw new Error(`${clip.id}: usable range ${start}-${end}s is shorter than 0.5s`);
  return { start, end, warning };
}

/** Stage 2: probe every input and normalise to the mezzanine spec. */
export async function ingest(manifest: InputManifest, manifestDir: string, mezzDir: string): Promise<IngestResult> {
  const log: string[] = [];
  const clips: ClipInfo[] = [];
  for (const clip of manifest.clips) {
    const src = resolveMedia(manifestDir, clip.file, `Clip "${clip.id}"`);
    const original = await probe(src, "video");
    const mezz = await normalizeClip(src, clip.id, original, mezzDir);
    const mezzProbe = await probe(mezz.file, "video");
    const range = usableRange(clip, mezzProbe.duration);
    if (range.warning) log.push(`WARN ${range.warning}`);
    log.push(
      `${clip.id}: ${original.width}x${original.height} ${original.codec} @${original.fps.toFixed(2)}fps ` +
        `${original.duration.toFixed(2)}s -> ${mezz.cached ? "cached" : mezz.transcoded ? "transcoded" : "remuxed"}`,
    );
    clips.push({
      id: clip.id,
      src: mezz.publicPath,
      player: clip.player,
      event: clip.event,
      importance: clip.importance,
      usableStart: range.start,
      usableEnd: range.end,
    });
  }
  const musicSrc = resolveMedia(manifestDir, manifest.music, "Music");
  await probe(musicSrc, "audio");
  const music = await normalizeMusic(musicSrc, mezzDir);
  log.push(`music: loudness-normalised -> ${music.publicPath}${music.cached ? " (cached)" : ""}`);
  return { clips, music, log };
}
