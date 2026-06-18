/**
 * Implements Linux lifecycle command behavior without pretending launchd
 * service management is available on non-macOS hosts.
 */
import type { InstallationActions, InstallationDependencies } from "./types";

/** Reports service lifecycle commands that do not have a Linux backend. */
async function unsupportedLinuxLifecycle(command: string): Promise<number> {
  console.error(`qctl ${command} is not supported on Linux; run qctl daemon in the foreground instead.`);
  return 1;
}

/** Creates Linux lifecycle helpers around explicit dependencies. */
export function createLinuxLifecycleActions(dependencies: InstallationDependencies): InstallationActions {
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
    install: () => unsupportedLinuxLifecycle("install"),
    installSystem: () => unsupportedLinuxLifecycle("install-system"),
    start: () => unsupportedLinuxLifecycle("start"),
    stop: () => unsupportedLinuxLifecycle("stop"),
    uninstall: () => unsupportedLinuxLifecycle("uninstall"),
  };
}
