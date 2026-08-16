/**
 * Resolves qctl collector endpoints and the environment qcontrol children
 * receive so they use qctl's config, data, and cache directories.
 */
import { createPlatformAdapter, platformAdapter, type PlatformAdapter } from "../platform";

const QCTL_CONFIG_DIR_ENV = "QCTL_CONFIG_DIR";
const QCTL_DATA_DIR_ENV = "QCTL_DATA_DIR";
const QCTL_CACHE_DIR_ENV = "QCTL_CACHE_DIR";
const QCONTROL_CONFIG_DIR_ENV = "QCONTROL_CONFIG_DIR";
const QCONTROL_DATA_DIR_ENV = "QCONTROL_DATA_DIR";
const QCONTROL_CACHE_DIR_ENV = "QCONTROL_CACHE_DIR";

/** Env keys sudo must keep so an elevated qcontrol still sees qctl's directories. */
export const QCONTROL_PRESERVED_ENV = [
  QCONTROL_CONFIG_DIR_ENV,
  QCONTROL_DATA_DIR_ENV,
  QCONTROL_CACHE_DIR_ENV,
  QCTL_CONFIG_DIR_ENV,
  QCTL_DATA_DIR_ENV,
  QCTL_CACHE_DIR_ENV,
  "QCTL_SOCKET_PATH",
  "HOME",
  "USERPROFILE",
].join(",");

/** Adapts legacy helper inputs to the shared platform contract. */
function platformAdapterFor(platform: NodeJS.Platform | PlatformAdapter): PlatformAdapter {
  return typeof platform === "string" ? createPlatformAdapter(platform) : platform;
}

/** Returns the local endpoint path where qctl listens for qcontrol events. */
export function getQctlSocketPath(platform: NodeJS.Platform | PlatformAdapter = platformAdapter): string {
  return platformAdapterFor(platform).defaultCollectorEndpoint(process.env);
}

/** Formats the local endpoint as the URL string expected by qcontrol sinks. */
export function getQctlSinkUrl(platform: NodeJS.Platform | PlatformAdapter = platformAdapter): string {
  const adapter = platformAdapterFor(platform);
  return adapter.sinkUrl(getQctlSocketPath(adapter));
}

/**
 * Builds the environment every qcontrol child should inherit: qctl's
 * directories exported as QCONTROL_* so qcontrol does not use its own defaults.
 */
export function getQctlEnvironment(
  platform: NodeJS.Platform | PlatformAdapter = platformAdapter,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const adapter = platformAdapterFor(platform);
  const user = adapter.resolveInvokingUser(env);
  const userEnv = user ? { ...env, HOME: user.home, USERPROFILE: user.home } : env;
  const configDir = adapter.configPath(userEnv);
  const dataDir = adapter.dataPath(userEnv);
  const cacheDir = adapter.defaultCacheRoot(userEnv);

  const next: NodeJS.ProcessEnv = {
    ...env,
    [QCTL_CONFIG_DIR_ENV]: configDir,
    [QCTL_DATA_DIR_ENV]: dataDir,
    [QCTL_CACHE_DIR_ENV]: cacheDir,
    [QCONTROL_CONFIG_DIR_ENV]: configDir,
    [QCONTROL_DATA_DIR_ENV]: dataDir,
    [QCONTROL_CACHE_DIR_ENV]: cacheDir,
  };

  if (user?.home) {
    next.HOME = user.home;
    next.USERPROFILE = user.home;
  }

  if (user?.username) {
    next.SUDO_USER = user.username;
  }

  return next;
}

/** @deprecated Use getQctlEnvironment. */
export const getQctlMonitorEnvironment = getQctlEnvironment;
