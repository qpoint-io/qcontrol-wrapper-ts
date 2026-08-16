/**
 * Defines the host platform contract used by qctl components that need
 * operating-system behavior without depending on direct platform checks.
 */

/** Identifies the interactive user whose qctl directories the elevated runtime must use. */
export interface InvokingUser {
  username: string;
  home: string;
}

/** Owns platform-specific paths, endpoint handling, and privilege capabilities. */
export interface PlatformAdapter {
  readonly kind: "linux" | "macos" | "windows";
  readonly qcontrolExecutableName: string;

  applyCollectorMode(endpointPath: string, mode?: number): Promise<void>;
  canElevateMonitor(): boolean;
  /** Directory that holds qctl's config.toml. */
  configPath(env?: NodeJS.ProcessEnv): string;
  /** Directory for qctl/qcontrol durable state (locks, taps, start pid). */
  dataPath(env?: NodeJS.ProcessEnv): string;
  defaultCacheRoot(env?: NodeJS.ProcessEnv): string;
  defaultCollectorEndpoint(env?: NodeJS.ProcessEnv): string;
  cleanupCollectorEndpoint(endpointPath: string): Promise<void>;
  prepareCollectorEndpoint(endpointPath: string): Promise<void>;
  prepareExecutable(binaryPath: string): Promise<void>;
  resolveInvokingUser(env?: NodeJS.ProcessEnv): InvokingUser | undefined;
  shouldOpenDaemonEndpoint(): boolean;
  sinkUrl(endpointPath: string): string;
}
