/**
 * Implements the launchd-backed lifecycle command graph used by qctl on macOS.
 */
import type { InstallationActions, InstallationDependencies } from "./types";

/** Options that bind generic lifecycle wiring to launchd-specific operations. */
export interface MacosLifecycleOptions {
  buildLaunchDaemonPlist: (options: { includeUserConfigEnvironment?: boolean; socketPath?: string }) => string;
  dependencies: InstallationDependencies;
  isLaunchDaemonLoaded: () => Promise<boolean>;
  launchDaemonPath: string;
  launchDaemonTarget: string;
  systemQctlSocketPath: () => string;
}

/** Creates launchd lifecycle helpers around explicit dependencies. */
export function createMacosLifecycleActions(options: MacosLifecycleOptions): InstallationActions {
  const { dependencies } = options;

  const installSystem = async (): Promise<number> => {
    const initExitCode = await dependencies.runQcontrolAsRoot({ args: ["init", "--system"] });
    if (initExitCode !== 0) {
      return initExitCode;
    }

    return dependencies.installLaunchDaemon(options.buildLaunchDaemonPlist({
      includeUserConfigEnvironment: false,
      socketPath: options.systemQctlSocketPath(),
    }));
  };

  const initUser = async (): Promise<number> => {
    const initExitCode = await dependencies.runQcontrol({ args: ["init", "--user"] });
    if (initExitCode !== 0) {
      return initExitCode;
    }

    await dependencies.appendQctlSinkConfig();
    return 0;
  };

  const install = async (): Promise<number> => {
    const systemExitCode = await installSystem();
    if (systemExitCode !== 0) {
      return systemExitCode;
    }

    return initUser();
  };

  const uninstall = async (): Promise<number> => {
    const launchDaemonExitCode = await dependencies.removeLaunchDaemon();
    if (launchDaemonExitCode !== 0) {
      return launchDaemonExitCode;
    }

    await dependencies.removeQctlSinkConfig();
    return 0;
  };

  const start = async (): Promise<number> => {
    if (!(await options.isLaunchDaemonLoaded())) {
      const bootstrapExitCode = await dependencies.runAsRoot([
        "launchctl",
        "bootstrap",
        "system",
        options.launchDaemonPath,
      ]);
      if (bootstrapExitCode !== 0) {
        return bootstrapExitCode;
      }
    }

    return dependencies.runAsRoot(["launchctl", "kickstart", "-k", options.launchDaemonTarget]);
  };

  const stop = async (): Promise<number> => {
    if (!(await options.isLaunchDaemonLoaded())) {
      return 0;
    }

    return dependencies.runAsRoot(["launchctl", "bootout", options.launchDaemonTarget]);
  };

  return { dependencies, install, installSystem, initUser, start, stop, uninstall };
}
