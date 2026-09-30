import { spawn } from "node:child_process";

export class CommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderrTail: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export interface ExecResult {
  readonly stdout: Buffer;
  readonly stderr: string;
}

/**
 * Runs a binary with an argument array (never through a shell, so file names
 * cannot inject commands). Rejects with the tail of stderr on non-zero exit.
 */
export function run(bin: string, args: readonly string[], opts: { allowFailure?: boolean } = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      const hint = e.code === "ENOENT" ? ` ("${bin}" not found on PATH - install ffmpeg/ffprobe)` : "";
      reject(new CommandError(`Failed to start ${bin}${hint}: ${e.message}`, bin, null, ""));
    });
    child.on("close", (code) => {
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0 && !opts.allowFailure) {
        const tail = stderr.trim().split(/\r?\n/).slice(-8).join("\n");
        reject(new CommandError(`${bin} exited with code ${code}:\n${tail}`, `${bin} ${args.join(" ")}`, code, tail));
        return;
      }
      resolve({ stdout: Buffer.concat(out), stderr });
    });
  });
}

export async function isAvailable(bin: string): Promise<boolean> {
  try {
    await run(bin, ["-version"]);
    return true;
  } catch {
    return false;
  }
}
