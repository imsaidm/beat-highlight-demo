import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Segment } from "../../schema/render-manifest";
import { unitFor, type Theme } from "../theme";

interface LowerThirdProps {
  readonly segment: Segment;
  readonly theme: Theme;
}

/** Player name + event, positioned inside the social-media safe area. */
export function PlayerLowerThird({ segment, theme }: LowerThirdProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = unitFor(width, height);
  const enter = spring({ frame: frame - 3, fps, config: { damping: 16, stiffness: 180 } });
  const exit = interpolate(frame, [segment.durationInFrames - 5, segment.durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const x = interpolate(enter, [0, 1], [-60 * u, 0]);
  const bottom = height > width ? height * 0.2 : height * 0.1;
  const badge = segment.isDrop ? (segment.playbackRate < 1 ? `TOP PLAY · ${segment.playbackRate}x` : "TOP PLAY") : null;

  return (
    <div
      style={{
        position: "absolute",
        left: 60 * u,
        bottom,
        opacity,
        transform: `translateX(${x}px) skewX(${theme.skew}deg)`,
        fontFamily: theme.fontFamily,
        fontStyle: theme.italic ? "italic" : "normal",
        letterSpacing: theme.letterSpacing,
        textTransform: "uppercase",
      }}
    >
      {badge ? (
        <div style={{ display: "inline-block", background: theme.badgeBackground, color: theme.badgeText, fontSize: 26 * u, fontWeight: 800, padding: `${6 * u}px ${14 * u}px`, marginBottom: 8 * u }}>
          {badge}
        </div>
      ) : null}
      <div style={{ background: theme.accent, color: theme.accentText, fontSize: 58 * u, fontWeight: theme.fontWeight, padding: `${8 * u}px ${24 * u}px`, lineHeight: 1.05 }}>
        {segment.player}
      </div>
      <div style={{ display: "inline-block", background: "rgba(0,0,0,0.78)", color: "#fff", fontSize: 36 * u, fontWeight: 700, padding: `${6 * u}px ${24 * u}px` }}>
        {segment.event}
      </div>
    </div>
  );
}
