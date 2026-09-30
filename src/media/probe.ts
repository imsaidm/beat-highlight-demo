import { z } from "zod";
import { run } from "./exec.js";

export interface ProbeResult {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  /** Average frame rate. */
  readonly fps: number;
  /** Base (r_frame_rate) frame rate; differs from `fps` for variable-frame-rate sources. */
  readonly rFps: number;
  readonly codec: string;
  readonly pixFmt: string;
  readonly hasAudio: boolean;
  /** Per-stream durations in seconds (0 when the container does not report one). */
  readonly videoDuration: number;
  readonly audioDuration: number;
}

const FfprobeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      pix_fmt: z.string().optional(),
      avg_frame_rate: z.string().optional(),
      r_frame_rate: z.string().optional(),
      duration: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.string().optional() }),
});

/** Parses "30000/1001" style rational strings. Returns 0 for invalid input. */
export function parseRational(value: string | undefined): number {
  if (!value) return 0;
  const [num, den] = value.split("/").map(Number);
  if (num === undefined || !Number.isFinite(num)) return 0;
  if (den === undefined) return num;
  return den > 0 && Number.isFinite(den) ? num / den : 0;
}

/** Pure: turns ffprobe JSON into a ProbeResult. Throws if there is no usable stream. */
export function interpretProbe(json: unknown, file: string, kind: "video" | "audio"): ProbeResult {
  const parsed = FfprobeSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Unexpected ffprobe output for ${file}`);
  const { streams, format } = parsed.data;
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const main = kind === "video" ? video : audio;
  if (!main) throw new Error(`${file} has no ${kind} stream`);
  const duration = Number(format.duration ?? main.duration ?? NaN);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${file}: could not determine duration`);
  const fps = parseRational(video?.avg_frame_rate) || parseRational(video?.r_frame_rate);
  const rFps = parseRational(video?.r_frame_rate) || fps;
  const streamDuration = (s: { duration?: string } | undefined): number => {
    const v = Number(s?.duration ?? NaN);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return Object.freeze({
    duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps,
    rFps,
    codec: main.codec_name ?? "unknown",
    pixFmt: video?.pix_fmt ?? "",
    hasAudio: Boolean(audio),
    videoDuration: streamDuration(video),
    audioDuration: streamDuration(audio),
  });
}

export async function probe(file: string, kind: "video" | "audio" = "video"): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,duration:format=duration",
    "-of", "json",
    file,
  ]);
  let json: unknown;
  try {
    json = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error(`ffprobe returned invalid JSON for ${file}`);
  }
  return interpretProbe(json, file, kind);
}
