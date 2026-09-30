import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Segment } from "../../schema/render-manifest";
import { pulse } from "../beat-fx";
import type { Theme } from "../theme";
import { PlayerLowerThird } from "./PlayerLowerThird";

interface ClipProps {
  readonly segment: Segment;
  readonly theme: Theme;
  /** Beat / downbeat frames on the global timeline. */
  readonly beatFrames: readonly number[];
  readonly downbeatFrames: readonly number[];
}

/** One shot: the trimmed (optionally slowed) mezzanine clip with a beat-synced zoom and lower third. */
export function Clip({ segment, theme, beatFrames, downbeatFrames }: ClipProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const globalFrame = segment.fromFrame + frame;

  const beatKick = theme.beatZoom * pulse(beatFrames, globalFrame, 4);
  const barKick = theme.downbeatZoom * pulse(downbeatFrames, globalFrame, 6);
  // The top play gets a slow push-in on top of the beat pulses.
  const pushIn = segment.isDrop ? interpolate(frame, [0, segment.durationInFrames], [1.0, 1.12]) : 1;
  const scale = pushIn * (1 + beatKick + barKick);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={staticFile(segment.src)}
          trimBefore={Math.round(segment.sourceStart * fps)}
          playbackRate={segment.playbackRate}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <PlayerLowerThird segment={segment} theme={theme} />
    </AbsoluteFill>
  );
}
