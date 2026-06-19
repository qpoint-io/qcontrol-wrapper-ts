/**
 * Defines lifecycle command contracts shared by platform-specific service
 * managers and the installation entry points that expose them.
 */
import type { RunQcontrolOptions } from "../qcontrol";

/** Testable collaborators for lifecycle commands that mutate qcontrol or host state. */
export interface InstallationDependencies {
  appendQctlSinkConfig: () => Promise<void>;
  installLaunchDaemon: (plist: string) => Promise<number>;
  removeQctlSinkConfig: () => Promise<void>;
  removeLaunchDaemon: () => Promise<number>;
  runAsRoot: (command: string[], stdio?: Bun.SpawnOptions.Readable) => Promise<number>;
  runQcontrol: (options?: RunQcontrolOptions) => Promise<number>;
  runQcontrolAsRoot: (options?: RunQcontrolOptions) => Promise<number>;
}

/** Lifecycle commands plus their collaborators, exposed for focused unit tests. */
export interface InstallationActions {
  dependencies: InstallationDependencies;
  install: () => Promise<number>;
  installSystem: () => Promise<number>;
  initUser: () => Promise<number>;
  start: () => Promise<number>;
  stop: () => Promise<number>;
  uninstall: () => Promise<number>;
}
