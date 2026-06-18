/**
 * Implements Windows lifecycle command behavior for qctl while service-manager
 * integration is owned separately from launchd.
 */
import type { InstallationActions, InstallationDependencies } from "./types";

/** Reports lifecycle commands whose service manager backend is unavailable. */
async function unsupportedWindowsLifecycle(command: string): Promise<number> {
  console.error(`qctl ${command} is not supported on Windows; run qctl daemon in the foreground instead.`);
  return 1;
}

/** Creates Windows lifecycle helpers around explicit dependencies. */
export function createWindowsLifecycleActions(dependencies: InstallationDependencies): InstallationActions {
  const initUser = async (): Promise<number> => {
    const initExitCode = await dependencies.runQcontrol({ args: ["init", "--user"] });
    if (initExitCode !== 0) {
      return initExitCode;
    }

    await dependencies.appendQctlSinkConfig();
    return 0;
  };

  return {
    dependencies,
    initUser,
    install: () => unsupportedWindowsLifecycle("install"),
    installSystem: () => unsupportedWindowsLifecycle("install-system"),
    start: () => unsupportedWindowsLifecycle("start"),
    stop: () => unsupportedWindowsLifecycle("stop"),
    uninstall: () => unsupportedWindowsLifecycle("uninstall"),
  };
}
