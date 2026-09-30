import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { RenderManifest } from "../schema/render-manifest.js";

const ENTRY = path.resolve(import.meta.dirname, "../remotion/index.ts");
export const COMPOSITION_ID = "Highlight";

export interface RenderOptions {
  readonly manifest: RenderManifest;
  /** Directory served as Remotion's public dir (the mezzanine folder). */
  readonly publicDir: string;
  readonly outFile: string;
  readonly onProgress?: (fraction: number) => void;
}

/** Bundles the composition and renders the manifest to H.264/AAC MP4. */
export async function renderHighlight(opts: RenderOptions): Promise<void> {
  const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: opts.publicDir });
  const inputProps = opts.manifest as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
  if (composition.durationInFrames !== opts.manifest.durationInFrames) {
    throw new Error(
      `Composition duration ${composition.durationInFrames} != manifest ${opts.manifest.durationInFrames} frames`,
    );
  }
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    crf: 20,
    pixelFormat: "yuv420p",
    outputLocation: opts.outFile,
    inputProps,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });
}
