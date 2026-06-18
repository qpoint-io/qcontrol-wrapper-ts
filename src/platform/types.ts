/**
 * Defines the host platform contract used by qctl components that need
 * operating-system behavior without depending on direct platform checks.
 */

/** Owns platform-specific paths, endpoint handling, and privilege capabilities. */
export interface PlatformAdapter {
  readonly kind: "linux" | "macos" | "windows";
  readonly qcontrolExecutableName: string;

  applyCollectorMode(endpointPath: string, mode?: number): Promise<void>;
  canUseRootScanner(): boolean;
  defaultCacheRoot(env?: NodeJS.ProcessEnv): string;
  defaultCollectorEndpoint(env?: NodeJS.ProcessEnv): string;
  cleanupCollectorEndpoint(endpointPath: string): Promise<void>;
  prepareCollectorEndpoint(endpointPath: string): Promise<void>;
  prepareExecutable(binaryPath: string): Promise<void>;
  qctlSinkUrls(currentEndpoint: string, legacyPosixEndpoint: string): string[];
  shouldOpenDaemonEndpoint(): boolean;
  sinkUrl(endpointPath: string): string;
}
