/**
 * Shared process helpers for start/stop/status placement: privilege checks,
 * sudo re-exec, pid liveness, and the wrapper command used to run `start -f`
 * in the background or as a service.
 */
import { basename } from "node:path";

/** True when this process can already satisfy elevated start/stop. */
export function isPrivileged(): boolean {
  const uid = typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.();
  return uid === 0;
}

/** True when this process is the compiled qctl binary rather than Bun. */
export function isCompiledWrapper(): boolean {
  return !/^bun(\.exe)?$/i.test(basename(process.execPath));
}

/**
 * Returns the argv prefix that re-invokes this wrapper.
 *
 * Compiled binaries are just `qctl`. Script-mode runs keep the Bun + entry
 * path so `qctl start` can detach `start -f` during development.
 */
export function wrapperInvocation(): string[] {
  if (isCompiledWrapper()) {
    return [process.execPath];
  }

  const script = process.argv[1];
  if (!script) {
    throw new Error("unable to resolve the qctl entry script for lifecycle placement");
  }

  return [process.execPath, script];
}

/**
 * Command line that places the collector and `qcontrol start -f` in this
 * process. `--raw` is forwarded so a detached or service child uses the same
 * printer as the invoking `qctl start`.
 */
export function wrapperForegroundCommand(options: { raw?: boolean } = {}): string[] {
  const command = [...wrapperInvocation(), "start", "-f"];
  if (options.raw) {
    command.push("--raw");
  }

  return command;
}

/** Runs a child with inherited stdio so sudo password prompts stay usable. */
export async function runCommand(
  command: string[],
  stdio: Bun.SpawnOptions.Readable = "inherit",
): Promise<number> {
  return Bun.spawn({
    cmd: command,
    stdin: "inherit",
    stdout: stdio,
    stderr: stdio,
  }).exited;
}

/** Re-runs the current wrapper command through sudo. */
export async function reexecAsRoot(args: string[]): Promise<number> {
  return runCommand(["sudo", "--", ...wrapperInvocation(), ...args]);
}

/** True when kill/ESRCH means the process is already gone. */
export function isProcessGone(error: unknown): boolean {
  return isErrno(error, "ESRCH");
}

/**
 * Best-effort liveness probe for a recorded start pid.
 *
 * `kill(pid, 0)` succeeds when this user can signal the process. EPERM/EACCES
 * still mean the pid exists (typical when start re-exec'd through sudo) so
 * those are treated as alive. ESRCH and any other failure are dead.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrno(error, "EPERM", "EACCES");
  }
}

/** Narrows a thrown value to a Node errno whose code is one of `codes`. */
function isErrno(error: unknown, ...codes: string[]): boolean {
  return error instanceof Error && "code" in error && codes.includes((error as NodeJS.ErrnoException).code ?? "");
}
