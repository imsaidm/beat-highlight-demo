import { AbsoluteFill, useCurrentFrame } from "remotion";
import { flash } from "../beat-fx";
import type { Theme } from "../theme";

interface BeatFlashProps {
  /** Frames of every cut (segment starts, intro/outro boundaries). */
  readonly cutFrames: readonly number[];
  readonly dropFrames: readonly number[];
  readonly theme: Theme;
}

/** White flash transition on every cut; a longer, full-strength flash on drops. */
export function BeatFlash({ cutFrames, dropFrames, theme }: BeatFlashProps) {
  const frame = useCurrentFrame();
  const onCut = theme.flashOpacity * flash(cutFrames, frame, theme.flashFrames);
  const onDrop = flash(dropFrames, frame, theme.flashFrames * 2);
  const opacity = Math.max(onCut, onDrop * Math.max(theme.flashOpacity, 0.6));
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity, pointerEvents: "none" }} />;
}
