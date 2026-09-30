import { Composition, type CalculateMetadataFunction } from "remotion";
import type { RenderManifest } from "../schema/render-manifest";
import { Highlight } from "./Highlight";

/** Placeholder props; real renders always pass a solver-generated manifest as inputProps. */
const placeholder: RenderManifest = {
  version: "1.0.0",
  fps: 30,
  width: 1080,
  height: 1920,
  format: "vertical",
  style: "hype",
  durationInFrames: 60,
  targetDuration: 2,
  music: { src: "", startAt: 0, bpm: 120 },
  intro: { fromFrame: 0, durationInFrames: 60, title: "RUN npm run make", subtitle: "placeholder" },
  outro: { fromFrame: 59, durationInFrames: 1, title: "", subtitle: "" },
  segments: [],
  beatFrames: [0, 15, 30, 45],
  downbeatFrames: [0],
  dropFrames: [],
  planner: "none",
  warnings: [],
};

const calculateMetadata: CalculateMetadataFunction<RenderManifest> = ({ props }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export function RemotionRoot() {
  return (
    <Composition
      id="Highlight"
      component={Highlight}
      defaultProps={placeholder}
      calculateMetadata={calculateMetadata}
      durationInFrames={placeholder.durationInFrames}
      fps={placeholder.fps}
      width={placeholder.width}
      height={placeholder.height}
    />
  );
}
