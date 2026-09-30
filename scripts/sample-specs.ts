/**
 * Declarative specs for the synthetic (copyright-free) demo media.
 * Kept separate from the generator so tests can reuse the music recipe.
 */

export interface MusicSpec {
  readonly bpm: number;
  readonly duration: number;
  /** Seconds at which the full beat + bass "drop" kicks in. */
  readonly dropAt: number;
}

export const DEFAULT_MUSIC: MusicSpec = Object.freeze({ bpm: 120, duration: 40, dropAt: 16 });

/**
 * ffmpeg aevalsrc expression for a kick / snare / hi-hat groove.
 * Pre-drop: light kick + hats, snare roll ramping up from dropAt/2. Post-drop: full kit + pumping sub bass.
 */
export function musicExpression({ bpm, dropAt }: MusicSpec): string {
  const B = (60 / bpm).toFixed(6);
  const tb = `mod(t,${B})`;
  const bar = `mod(t,4*${B})`;
  const pre = `lt(t,${dropAt})`;
  const post = `gte(t,${dropAt})`;
  const accent = `(1+0.4*lt(${bar},${B}))`;
  const kick = `sin(2*PI*(45+110*exp(-${tb}*28))*${tb})*exp(-${tb}*9)*${accent}`;
  const ts = `mod(t-${B},2*${B})`;
  const snare = `((random(0)*2-1)*0.8+0.4*sin(2*PI*190*${ts}))*exp(-${ts}*16)`;
  const th = `mod(t,${B}/2)`;
  const hat = `(random(1)*2-1)*exp(-${th}*80)`;
  const roll = `(random(2)*2-1)*exp(-mod(t,${B}/2)*22)*gte(t,${dropAt / 2})*(t-${dropAt / 2})/${dropAt / 2}`;
  const bass = `sin(2*PI*55*t)*(1-exp(-${tb}*7))`;
  const stab = `sin(2*PI*330*t)*exp(-mod(t-${B}/2,${B})*10)`;
  return [
    `${pre}*(0.30*${kick}+0.10*${hat}+0.22*${roll})`,
    `${post}*(0.75*${kick}+0.35*${snare}+0.14*${hat}+0.32*${bass}+0.10*${stab})`,
  ].join("+");
}

export function musicArgs(spec: MusicSpec, outFile: string): string[] {
  return [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `aevalsrc=exprs='${musicExpression(spec)}':s=44100:d=${spec.duration}`,
    "-af", "alimiter=limit=0.9",
    "-ac", "2", "-c:a", "pcm_s16le", outFile,
  ];
}

export interface ClipSpec {
  readonly id: string;
  readonly player: string;
  readonly number: string;
  readonly event: string;
  readonly importance: 1 | 2 | 3 | 4 | 5;
  readonly duration: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly source: "testsrc2" | "gradients";
  readonly colors: readonly [string, string];
  readonly inPoint?: number;
  readonly outPoint?: number;
}

const clip = (s: ClipSpec): ClipSpec => Object.freeze(s);

export const CLIPS: readonly ClipSpec[] = Object.freeze([
  clip({ id: "dunk-23", player: "J. Carter", number: "23", event: "DUNK", importance: 5, duration: 6, fps: 60, width: 1280, height: 720, source: "testsrc2", colors: ["#ff5a1f", "#1d1d6b"] }),
  clip({ id: "three-11", player: "M. Reyes", number: "11", event: "THREE", importance: 4, duration: 5, fps: 30, width: 1920, height: 1080, source: "gradients", colors: ["#0b7cff", "#00d4a6"] }),
  clip({ id: "block-34", player: "D. Okafor", number: "34", event: "BLOCK", importance: 4, duration: 4, fps: 25, width: 1280, height: 720, source: "gradients", colors: ["#b3001b", "#ffb400"] }),
  clip({ id: "assist-3", player: "K. Lin", number: "3", event: "ASSIST", importance: 3, duration: 5, fps: 24, width: 1280, height: 720, source: "gradients", colors: ["#6a00f4", "#f72585"] }),
  clip({ id: "steal-7", player: "T. Brooks", number: "7", event: "STEAL", importance: 3, duration: 4, fps: 30, width: 1280, height: 720, source: "testsrc2", colors: ["#2ec4b6", "#011627"] }),
  clip({ id: "alleyoop-23", player: "J. Carter", number: "23", event: "ALLEY-OOP", importance: 5, duration: 5, fps: 60, width: 1920, height: 1080, source: "gradients", colors: ["#ff006e", "#fb5607"] }),
  clip({ id: "layup-5", player: "A. Diaz", number: "5", event: "LAYUP", importance: 2, duration: 3, fps: 30, width: 1280, height: 720, source: "gradients", colors: ["#3a86ff", "#8338ec"] }),
  clip({ id: "crossover-11", player: "M. Reyes", number: "11", event: "CROSSOVER", importance: 3, duration: 6, fps: 30, width: 1280, height: 720, source: "testsrc2", colors: ["#ffbe0b", "#3a0ca3"] }),
  clip({ id: "fastbreak-7", player: "T. Brooks", number: "7", event: "FASTBREAK", importance: 2, duration: 8, fps: 25, width: 1280, height: 720, source: "gradients", colors: ["#06d6a0", "#118ab2"], inPoint: 2, outPoint: 7 }),
  clip({ id: "winner-11", player: "M. Reyes", number: "11", event: "WINNER", importance: 5, duration: 7, fps: 30, width: 1920, height: 1080, source: "gradients", colors: ["#ffd60a", "#d00000"] }),
]);

/** Escapes a path for use inside a single-quoted ffmpeg filter option. */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function clipArgs(c: ClipSpec, fontFile: string, outFile: string): string[] {
  const { width: w, height: h, fps, duration: d } = c;
  const bg =
    c.source === "testsrc2"
      ? `testsrc2=s=${w}x${h}:r=${fps}:d=${d},hue=s=0.6`
      : `gradients=s=${w}x${h}:r=${fps}:d=${d}:c0=${c.colors[0]}:c1=${c.colors[1]}:speed=0.03`;
  const font = `fontfile='${escapeFilterPath(fontFile)}'`;
  const r = Math.round(h * 0.07);
  const ball = `color=c=${c.colors[0]}:s=${2 * r}x${2 * r}:r=${fps}:d=${d},format=rgba,geq=r='255':g='150':b='40':a='if(lt(hypot(X-${r},Y-${r}),${r - 2}),255,0)'`;
  const text = [
    `drawgrid=w=iw/8:h=ih/6:t=2:c=white@0.12`,
    `drawtext=${font}:text='#${c.number}':fontsize=h/4:fontcolor=white:borderw=6:bordercolor=black@0.6:x=(w-text_w)/2:y=h*0.18`,
    `drawtext=${font}:text='${c.event}':fontsize=h/12:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h*0.52`,
    `drawtext=${font}:text='SRC %{pts\\:hms}':fontsize=h/30:fontcolor=white@0.85:x=(w-text_w)/2:y=h*0.9`,
  ].join(",");
  const graph =
    `${bg}[bg];${ball}[ball];` +
    `[bg][ball]overlay=x='(W-w)/2+W*0.12*sin(t*2.2)':y='H*0.62+H*0.12*abs(cos(t*3.1))'[v];[v]${text}[out]`;
  return [
    "-y", "-v", "error", "-filter_complex", graph, "-map", "[out]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-t", String(d), outFile,
  ];
}
