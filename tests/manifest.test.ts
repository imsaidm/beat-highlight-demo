import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePlan } from "../src/planner/editorial-planner.js";
import { ManifestValidationError, parseInputManifest } from "../src/schema/input-manifest.js";
import { SolverError } from "../src/solver/types.js";

const valid = {
  style: "hype",
  format: "vertical",
  music: "media/music.wav",
  clips: [
    { id: "a", file: "a.mp4", player: "#1 A", event: "dunk", importance: 5 },
    { id: "b", file: "b.mp4", player: "#2 B", event: "three", importance: 3, inPoint: 1, outPoint: 4 },
    { id: "c", file: "c.mp4", player: "#3 C", event: "block", importance: 1 },
  ],
};

const issuesOf = (raw: unknown): string[] => {
  try {
    parseInputManifest(raw);
  } catch (e) {
    if (e instanceof ManifestValidationError) return [...e.issues];
    throw e;
  }
  return [];
};

describe("input manifest validation", () => {
  it("accepts a valid manifest and applies defaults", () => {
    const m = parseInputManifest(valid);
    expect(m.targetDuration).toBe(30);
    expect(m.title).toBe("SEASON HIGHLIGHTS");
    expect(Object.isFrozen(m.clips[0])).toBe(true);
  });

  it("accepts the shipped sample manifest", () => {
    const file = path.resolve(import.meta.dirname, "../input/manifest.json");
    expect(() => parseInputManifest(JSON.parse(readFileSync(file, "utf8")))).not.toThrow();
  });

  it.each([
    ["importance out of range", { ...valid, clips: [{ ...valid.clips[0], importance: 6 }, ...valid.clips.slice(1)] }, "clips.0.importance"],
    ["unknown format", { ...valid, format: "portrait" }, "format"],
    ["unknown style", { ...valid, style: "chill" }, "style"],
    ["missing music", { ...valid, music: undefined }, "music"],
    ["too few clips", { ...valid, clips: valid.clips.slice(0, 2) }, "at least 3 clips"],
    ["outPoint before inPoint", { ...valid, clips: [{ ...valid.clips[0], inPoint: 5, outPoint: 2 }, ...valid.clips.slice(1)] }, "outPoint must be greater"],
    ["duplicate ids", { ...valid, clips: [...valid.clips, { ...valid.clips[0] }] }, 'duplicate clip id "a"'],
    ["unsafe id", { ...valid, clips: [{ ...valid.clips[0], id: "../evil" }, ...valid.clips.slice(1)] }, "clips.0.id"],
    ["unknown key (typo)", { ...valid, targetDuraton: 30 }, "targetDuraton"],
    ["target too short", { ...valid, targetDuration: 3 }, "targetDuration"],
  ])("rejects %s with a path-qualified message", (_name, raw, expected) => {
    const issues = issuesOf(raw);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join("\n")).toContain(expected);
  });

  it("reports every problem at once", () => {
    const issues = issuesOf({ ...valid, style: "x", format: "y" });
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("editorial plan validation", () => {
  const ids = ["a", "b", "c", "d"];
  const plan = { opener: "b", build: ["d"], top: "a", afterDrop: [], closer: "c" };

  it("accepts a complete plan", () => {
    expect(validatePlan(plan, ids).top).toBe("a");
  });

  it.each([
    ["schema violation", { ...plan, top: 42 }, /schema validation/],
    ["extra keys", { ...plan, sneaky: true }, /schema validation/],
    ["duplicate use", { ...plan, build: ["a"] }, /more than once/],
    ["missing clip", { ...plan, build: [] }, /does not account for clips: d/],
  ])("rejects %s", (_n, raw, re) => {
    expect(() => validatePlan(raw, ids)).toThrow(SolverError);
    expect(() => validatePlan(raw, ids)).toThrow(re);
  });
});
