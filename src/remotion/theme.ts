import type { RenderManifest } from "../schema/render-manifest";

export interface Theme {
  readonly background: string;
  readonly cardBackground: string;
  readonly cardText: string;
  readonly accent: string;
  readonly accentText: string;
  readonly badgeBackground: string;
  readonly badgeText: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly italic: boolean;
  readonly letterSpacing: string;
  /** Frames a white flash lasts after each cut (0 disables). */
  readonly flashFrames: number;
  readonly flashOpacity: number;
  /** Peak extra zoom on each beat (0.05 = +5%). */
  readonly beatZoom: number;
  readonly downbeatZoom: number;
  /** Lower-third skew in degrees. */
  readonly skew: number;
}

/** System fonts only: rendering never needs network access. */
export const THEMES: Readonly<Record<RenderManifest["style"], Theme>> = Object.freeze({
  hype: Object.freeze({
    background: "#111",
    cardBackground: "linear-gradient(160deg, #ff3d00 0%, #c2185b 55%, #6a1b9a 100%)",
    cardText: "#ffffff",
    accent: "#ffd400",
    accentText: "#111111",
    badgeBackground: "#ffffff",
    badgeText: "#111111",
    fontFamily: "'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 900,
    italic: true,
    letterSpacing: "0.02em",
    flashFrames: 5,
    flashOpacity: 0.85,
    beatZoom: 0.035,
    downbeatZoom: 0.07,
    skew: -10,
  }),
  recruiting: Object.freeze({
    background: "#f4f6f9",
    cardBackground: "linear-gradient(180deg, #ffffff 0%, #e8edf4 100%)",
    cardText: "#0b1f3a",
    accent: "#1565c0",
    accentText: "#ffffff",
    badgeBackground: "#0b1f3a",
    badgeText: "#ffffff",
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 600,
    italic: false,
    letterSpacing: "0.08em",
    flashFrames: 3,
    flashOpacity: 0.35,
    beatZoom: 0,
    downbeatZoom: 0.012,
    skew: 0,
  }),
});

/** Scale factor so sizes authored for 1080px short side work in every format. */
export const unitFor = (width: number, height: number): number => Math.min(width, height) / 1080;
