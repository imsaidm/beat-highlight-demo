import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Card } from "../../schema/render-manifest";
import { pulse } from "../beat-fx";
import { unitFor, type Theme } from "../theme";

interface TitleCardProps {
  readonly card: Card;
  readonly theme: Theme;
  readonly variant: "intro" | "outro";
  /** Beat frames on the global timeline, for the title pulse. */
  readonly beatFrames: readonly number[];
}

/** Intro / outro card. Content comes entirely from the manifest. */
export function TitleCard({ card, theme, variant, beatFrames }: TitleCardProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = unitFor(width, height);
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const fadeOut = variant === "outro"
    ? interpolate(frame, [card.durationInFrames - 8, card.durationInFrames], [1, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const beat = 1 + 0.04 * pulse(beatFrames, card.fromFrame + frame, 5);

  return (
    <AbsoluteFill
      style={{
        background: theme.cardBackground,
        color: theme.cardText,
        fontFamily: theme.fontFamily,
        fontStyle: theme.italic ? "italic" : "normal",
        textTransform: "uppercase",
        letterSpacing: theme.letterSpacing,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: 80 * u,
        opacity: fadeOut,
      }}
    >
      <div style={{ transform: `scale(${interpolate(enter, [0, 1], [0.6, 1]) * beat})` }}>
        {variant === "outro" ? (
          <div style={{ fontSize: 40 * u, fontWeight: 700, opacity: 0.9, marginBottom: 20 * u }}>{card.subtitle}</div>
        ) : null}
        <div style={{ fontSize: 120 * u, fontWeight: theme.fontWeight, lineHeight: 1 }}>{card.title}</div>
        <div style={{ height: 10 * u, width: interpolate(enter, [0, 1], [0, 420 * u]), background: theme.accent, margin: `${28 * u}px auto` }} />
        {variant === "intro" ? (
          <div style={{ fontSize: 48 * u, fontWeight: 700, opacity: interpolate(frame, [6, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            {card.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
