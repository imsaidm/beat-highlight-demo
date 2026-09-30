import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import type { RenderManifest } from "../schema/render-manifest";
import { BeatFlash } from "./components/BeatFlash";
import { Clip } from "./components/Clip";
import { TitleCard } from "./components/TitleCard";
import { THEMES } from "./theme";

/**
 * The only composition. Everything - order, timing, trims, speed, text,
 * style, format - comes from the render manifest. No per-video code.
 */
export function Highlight(props: RenderManifest) {
  const { fps } = useVideoConfig();
  const theme = THEMES[props.style];
  const cutFrames = [
    ...props.segments.map((s) => s.fromFrame),
    props.outro.fromFrame,
  ].sort((a, b) => a - b);
  const fadeFrames = Math.round(fps * 0.4);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {props.music.src ? (
        <Audio
          src={staticFile(props.music.src)}
          trimBefore={Math.round(props.music.startAt * fps)}
          volume={(f) =>
            interpolate(f, [props.durationInFrames - fadeFrames, props.durationInFrames], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}

      <Sequence from={props.intro.fromFrame} durationInFrames={props.intro.durationInFrames} name="Intro">
        <TitleCard card={props.intro} theme={theme} variant="intro" beatFrames={props.beatFrames} />
      </Sequence>

      {props.segments.map((s) => (
        <Sequence key={`${s.clipId}-${s.fromFrame}`} from={s.fromFrame} durationInFrames={s.durationInFrames} name={`${s.role}: ${s.clipId}`}>
          <Clip segment={s} theme={theme} beatFrames={props.beatFrames} downbeatFrames={props.downbeatFrames} />
        </Sequence>
      ))}

      <Sequence from={props.outro.fromFrame} durationInFrames={props.outro.durationInFrames} name="Outro">
        <TitleCard card={props.outro} theme={theme} variant="outro" beatFrames={props.beatFrames} />
      </Sequence>

      <BeatFlash cutFrames={cutFrames} dropFrames={props.dropFrames} theme={theme} />
    </AbsoluteFill>
  );
}
