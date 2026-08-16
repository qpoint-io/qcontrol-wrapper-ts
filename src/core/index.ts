/**
 * qctl's reusable core: collector, monitor host, qcontrol spawning, and the
 * config/path helpers those pieces share. Lifecycle and platform adapters
 * sit outside this namespace and call into it.
 */
export { Collector, type CollectorOptions, type CollectorStats } from "./collector";
export {
  defaultQctlConfig,
  ensureQctlLayout,
  getQctlConfigFilePath,
} from "./config";
export {
  type Forwarder,
  type QcontrolEvent,
  type QcontrolInstallation,
  type QcontrolProcess,
} from "./forwarder";
export { Monitor, type MonitorOptions } from "./monitor";
export {
  QCONTROL_PRESERVED_ENV,
  getQctlEnvironment,
  getQctlMonitorEnvironment,
  getQctlSinkUrl,
  getQctlSocketPath,
} from "./paths";
export {
  defaultCacheRoot,
  getQcontrolPath,
  qcontrolExecutableName,
  runQcontrol,
  runQcontrolAsRoot,
  spawnQcontrol,
  spawnQcontrolAsRoot,
  type QcontrolBundleOptions,
  type RunQcontrolOptions,
} from "./qcontrol";
