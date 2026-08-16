/**
 * Windows SCM placement for `qctl start --service` and the matching `qctl stop`.
 *
 * Registers a demand-start LocalSystem service whose binPath is `qctl start -f`.
 * Stop deletes the SCM registration. A dedicated service host is not required
 * for registration; SCM may still expect a native service protocol.
 */
import { isCompiledWrapper, runCommand, wrapperForegroundCommand } from "./process";
import { writeLifecycleState } from "./state";
import type { RuntimeOptions } from "./runtime";

const SERVICE_NAME = "qctl";
const SERVICE_DISPLAY_NAME = "qctl";
const SERVICE_DESCRIPTION = "Collects qcontrol events through qctl.";

/** Quotes one Windows argv value for command lines stored inside SCM. */
export function quoteWindowsArgument(value: string): string {
  if (value.length > 0 && !/[\s"]/.test(value)) {
    return value;
  }

  let quoted = '"';
  let backslashes = 0;

  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }

    if (character === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += character;
      backslashes = 0;
      continue;
    }

    quoted += "\\".repeat(backslashes);
    quoted += character;
    backslashes = 0;
  }

  return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}

/** Builds the `binPath=` value SCM should execute. */
export function windowsServiceBinPath(command = wrapperForegroundCommand()): string {
  return command.map(quoteWindowsArgument).join(" ");
}

/** Creates or updates the SCM service and starts it. */
export async function startWindowsService(options: RuntimeOptions = {}): Promise<number> {
  if (!isCompiledWrapper()) {
    console.error("qctl start --service must run from the compiled qctl.exe");
    return 1;
  }

  const binPath = windowsServiceBinPath(wrapperForegroundCommand(options));
  const createExitCode = await runCommand([
    "sc.exe",
    "create",
    SERVICE_NAME,
    "binPath=",
    binPath,
    "start=",
    "demand",
    "obj=",
    "LocalSystem",
    "DisplayName=",
    SERVICE_DISPLAY_NAME,
  ]);
  if (createExitCode !== 0) {
    const configExitCode = await runCommand([
      "sc.exe",
      "config",
      SERVICE_NAME,
      "binPath=",
      binPath,
      "start=",
      "demand",
      "obj=",
      "LocalSystem",
      "DisplayName=",
      SERVICE_DISPLAY_NAME,
    ]);
    if (configExitCode !== 0) {
      return configExitCode;
    }
  }

  await runCommand(["sc.exe", "description", SERVICE_NAME, SERVICE_DESCRIPTION], "ignore");
  const startExitCode = await runCommand(["sc.exe", "start", SERVICE_NAME]);
  if (startExitCode !== 0) {
    return startExitCode;
  }

  await writeLifecycleState({ manager: "windows_scm" });
  console.log("qctl started (windows service)");
  return 0;
}

/** Stops and deletes the SCM service. A missing service is success. */
export async function stopWindowsService(): Promise<number> {
  await runCommand(["sc.exe", "stop", SERVICE_NAME], "ignore");
  await runCommand(["sc.exe", "delete", SERVICE_NAME], "ignore");
  console.log("qctl stopped (windows service)");
  return 0;
}
