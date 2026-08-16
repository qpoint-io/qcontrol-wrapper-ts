/**
 * Owns qctl's local event collector, which receives qcontrol monitor records
 * from a macOS/Linux socket or Windows named pipe, resolves entity and
 * installation context, and dispatches complete records to forwarders.
 */
import { createServer, type Server, type Socket } from "node:net";

import {
  type Forwarder,
  type QcontrolEvent,
  type QcontrolInstallation,
  type QcontrolProcess,
} from "./forwarder";
import { getQctlSocketPath } from "./paths";
import { platformAdapter, type PlatformAdapter } from "../platform";

const DEFAULT_QUEUE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_QUEUED_EVENTS = 10_000;
const DEFAULT_MAX_QUEUED_EVENTS_PER_KEY = 1_000;
const DEFAULT_PROCESS_EVICTION_GRACE_MS = 30 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;

/**
 * Raw socket record before the collector vouches for its shape. Records are
 * only narrowed to the public QcontrolEvent contract when handed to
 * forwarders, so all defensive field reads stay on this loose type.
 */
type RawRecord = Record<string, unknown>;

/** Configures socket ownership and forwarding behavior for a collector instance. */
export interface CollectorOptions {
  platform?: PlatformAdapter;
  socketPath?: string;
  socketMode?: number;
  forwarders?: Forwarder[];
  queueTtlMs?: number;
  maxQueuedEvents?: number;
  maxQueuedEventsPerKey?: number;
  processEvictionGraceMs?: number;
}

/** Counts collector routing outcomes so shed load is observable from outside. */
export interface CollectorStats {
  forwarded: number;
  queued: number;
  expired: number;
  evicted: number;
  dropped: number;
  pending: number;
}

/** Names the index entry an unresolved event is waiting for. */
type DependencyKey = `inst:${string}` | `entity:${string}`;

/**
 * Reports what routing did with one event: delivered, discarded as malformed,
 * or blocked on a specific missing dependency the caller may park it under.
 */
type ForwardResult =
  | { status: "forwarded" }
  | { status: "dropped" }
  | { status: "waiting"; on: DependencyKey };

/** Tracks an unresolved event until its process or installation can be found. */
interface QueuedEvent {
  event: RawRecord;
  expiresAt: number;
}

/** Confirms a parsed value is an object payload that can carry qcontrol fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the event payload only when qcontrol provided an object payload. */
function getPayload(event: RawRecord): RawRecord | undefined {
  return isRecord(event.payload) ? event.payload : undefined;
}

/** Reads a required string identifier from a record without coercing bad data. */
function getStringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Copies the monitor-authored process identity off the event envelope. */
function getEntityId(event: RawRecord): string | undefined {
  return getStringField(event, "entity_id");
}

/** Builds the process record forwarders see, using the envelope entity_id as-is. */
function processFromStarted(event: RawRecord, payload: RawRecord): RawRecord | undefined {
  const entityId = getEntityId(event);
  if (!entityId) {
    return undefined;
  }

  return { ...payload, entity_id: entityId };
}

/** Builds process context from one snapshot entry that already carries entity_id. */
function processFromSnapshotEntry(entry: RawRecord): RawRecord | undefined {
  const entityId = getStringField(entry, "entity_id");
  if (!entityId) {
    return undefined;
  }

  return { ...entry, entity_id: entityId };
}

/** Resolved configuration the collector hands to its event router. */
interface EventRouterOptions {
  forwarders: Forwarder[];
  queueTtlMs: number;
  maxQueuedEvents: number;
  maxQueuedEventsPerKey: number;
  processEvictionGraceMs: number;
}

/**
 * Resolves qcontrol event context by indexing installations and process
 * lifetimes, then holding entity-scoped records until their process exists.
 * Unresolved events are parked under the specific dependency they are missing.
 */
class EventRouter {
  private readonly forwarders: Forwarder[];
  private readonly installations = new Map<string, RawRecord>();
  private readonly processes = new Map<string, RawRecord>();
  private readonly pending = new Map<DependencyKey, QueuedEvent[]>();
  private pendingCount = 0;
  private readonly stoppedProcessDeadlines = new Map<string, number>();
  private readonly queueTtlMs: number;
  private readonly maxQueuedEvents: number;
  private readonly maxQueuedEventsPerKey: number;
  private readonly processEvictionGraceMs: number;
  private readonly counters = { forwarded: 0, queued: 0, expired: 0, evicted: 0, dropped: 0 };
  private lastReportedShed = 0;
  private sweepTimer?: NodeJS.Timeout;

  constructor(options: EventRouterOptions) {
    this.forwarders = options.forwarders;
    this.queueTtlMs = options.queueTtlMs;
    this.maxQueuedEvents = options.maxQueuedEvents;
    this.maxQueuedEventsPerKey = options.maxQueuedEventsPerKey;
    this.processEvictionGraceMs = options.processEvictionGraceMs;
  }

  /** Returns a point-in-time snapshot of routing outcomes and queue depth. */
  get stats(): CollectorStats {
    return { ...this.counters, pending: this.pendingCount };
  }

  /** Resolves, forwards, or parks one parsed qcontrol event. */
  route(event: RawRecord): void {
    const result = this.tryForward(event);
    if (result.status === "waiting") {
      this.park({ event, expiresAt: Date.now() + this.queueTtlMs }, result.on, true);
    }
  }

  /** Starts the periodic sweep that expires parked events and prunes indexes. */
  startSweeping(): void {
    if (this.sweepTimer) {
      return;
    }

    this.sweepTimer = setInterval(() => {
      this.sweep(Date.now());
    }, SWEEP_INTERVAL_MS);
    // The sweep exists to serve event traffic; it should never keep an
    // otherwise-finished process alive.
    this.sweepTimer.unref();
  }

  /** Stops the periodic sweep when the owning collector shuts down. */
  stopSweeping(): void {
    if (!this.sweepTimer) {
      return;
    }

    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  /**
   * Expires parked events past their TTL, unindexes processes whose stop grace
   * window has lapsed, and reports any load shed since the last sweep.
   */
  sweep(now: number): void {
    for (const [key, bucket] of this.pending) {
      const retained = bucket.filter((queuedEvent) => queuedEvent.expiresAt > now);
      const removed = bucket.length - retained.length;
      if (removed === 0) {
        continue;
      }

      this.counters.expired += removed;
      this.pendingCount -= removed;
      if (retained.length === 0) {
        this.pending.delete(key);
      } else {
        this.pending.set(key, retained);
      }
    }

    for (const [entityId, deadline] of this.stoppedProcessDeadlines) {
      if (deadline <= now) {
        this.stoppedProcessDeadlines.delete(entityId);
        this.processes.delete(entityId);
      }
    }

    this.reportShedding();
  }

  /**
   * Attempts delivery without retaining unresolved events; callers decide whether
   * a waiting record belongs in the pending queue.
   */
  private tryForward(event: RawRecord): ForwardResult {
    switch (event.type) {
      case "installation.discovered":
        return this.forwardInstallationDiscovered(event);
      case "installation.snapshot":
        return this.forwardInstallationSnapshot(event);
      case "process.started":
        return this.forwardProcessStarted(event);
      case "process.snapshot":
        return this.forwardProcessSnapshot(event);
      case "process.stopped":
        return this.forwardProcessStopped(event);
      default:
        return this.forwardDefault(event);
    }
  }

  /** Stores a discovered installation and forwards the event with itself attached. */
  private forwardInstallationDiscovered(event: RawRecord): ForwardResult {
    const installation = getPayload(event);
    if (!installation) {
      console.error("dropping installation.discovered event without payload");
      this.counters.dropped += 1;
      return { status: "dropped" };
    }

    const installationId = getStringField(installation, "id");
    if (installationId) {
      this.installations.set(installationId, installation);
    }

    this.forward(event, installation);
    if (installationId) {
      this.flushPending(`inst:${installationId}`);
    }
    return { status: "forwarded" };
  }

  /** Replaces the installation index with the monitor's authoritative set. */
  private forwardInstallationSnapshot(event: RawRecord): ForwardResult {
    const payload = getPayload(event);
    const records = payload && Array.isArray(payload.installations) ? payload.installations : undefined;
    if (!records) {
      console.error("dropping installation.snapshot event without payload.installations");
      this.counters.dropped += 1;
      return { status: "dropped" };
    }

    this.installations.clear();
    const flushedIds: string[] = [];
    for (const record of records) {
      if (!isRecord(record)) {
        continue;
      }

      const installationId = getStringField(record, "id");
      if (!installationId) {
        continue;
      }

      this.installations.set(installationId, record);
      flushedIds.push(installationId);
    }

    this.forward(event);
    for (const installationId of flushedIds) {
      this.flushPending(`inst:${installationId}`);
    }
    return { status: "forwarded" };
  }

  /** Stores a started process after any declared installation is available. */
  private forwardProcessStarted(event: RawRecord): ForwardResult {
    const payload = getPayload(event);
    const processRecord = payload ? processFromStarted(event, payload) : undefined;
    if (!processRecord) {
      console.error("dropping process.started event without entity_id");
      this.counters.dropped += 1;
      return { status: "dropped" };
    }

    const installationId = getStringField(processRecord, "installation_id");
    if (installationId && !this.installations.has(installationId)) {
      return { status: "waiting", on: `inst:${installationId}` };
    }

    return this.indexProcess(event, processRecord, installationId);
  }

  /** Replaces the process index with the monitor's authoritative running set. */
  private forwardProcessSnapshot(event: RawRecord): ForwardResult {
    const payload = getPayload(event);
    const records = payload && Array.isArray(payload.processes) ? payload.processes : undefined;
    if (!records) {
      console.error("dropping process.snapshot event without payload.processes");
      this.counters.dropped += 1;
      return { status: "dropped" };
    }

    this.processes.clear();
    this.stoppedProcessDeadlines.clear();

    const flushedIds: string[] = [];
    for (const record of records) {
      if (!isRecord(record)) {
        continue;
      }

      const processRecord = processFromSnapshotEntry(record);
      if (!processRecord) {
        continue;
      }

      const entityId = getStringField(processRecord, "entity_id");
      if (!entityId) {
        continue;
      }

      this.processes.set(entityId, processRecord);
      flushedIds.push(entityId);
    }

    this.forward(event);
    for (const entityId of flushedIds) {
      this.flushPending(`entity:${entityId}`);
    }
    return { status: "forwarded" };
  }

  /** Forwards a stop after the matching process lifetime is known, then evicts. */
  private forwardProcessStopped(event: RawRecord): ForwardResult {
    const entityId = getEntityId(event);
    if (!entityId) {
      console.error("dropping process.stopped event without entity_id");
      this.counters.dropped += 1;
      return { status: "dropped" };
    }

    const processRecord = this.processes.get(entityId);
    if (!processRecord) {
      return { status: "waiting", on: `entity:${entityId}` };
    }

    const installation = this.installationForProcess(processRecord);
    this.forward(event, installation, processRecord);
    this.stoppedProcessDeadlines.set(entityId, Date.now() + this.processEvictionGraceMs);
    return { status: "forwarded" };
  }

  /**
   * Forwards remaining records: entity-scoped events wait for their process,
   * host records deliver immediately with whatever installation context exists.
   */
  private forwardDefault(event: RawRecord): ForwardResult {
    const entityId = getEntityId(event);
    if (!entityId) {
      const payload = getPayload(event);
      const installationId = payload ? getStringField(payload, "id") : undefined;
      const installation = installationId ? this.installations.get(installationId) : undefined;
      this.forward(event, installation);
      return { status: "forwarded" };
    }

    const processRecord = this.processes.get(entityId);
    if (!processRecord) {
      return { status: "waiting", on: `entity:${entityId}` };
    }

    this.forward(event, this.installationForProcess(processRecord), processRecord);
    return { status: "forwarded" };
  }

  /** Indexes one live process and unlocks events waiting on its entity_id. */
  private indexProcess(event: RawRecord, processRecord: RawRecord, installationId?: string): ForwardResult {
    const entityId = getStringField(processRecord, "entity_id");
    if (!entityId) {
      console.error("dropping process record without entity_id");
      this.counters.dropped += 1;
      return { status: "dropped" };
    }

    this.stoppedProcessDeadlines.delete(entityId);
    this.processes.set(entityId, processRecord);
    const installation = installationId ? this.installations.get(installationId) : undefined;
    this.forward(event, installation, processRecord);
    this.flushPending(`entity:${entityId}`);
    return { status: "forwarded" };
  }

  /** Resolves installation context from a process record's optional join key. */
  private installationForProcess(processRecord: RawRecord): RawRecord | undefined {
    const installationId = getStringField(processRecord, "installation_id");
    return installationId ? this.installations.get(installationId) : undefined;
  }

  /** Delivers a resolved event to each configured destination in collector order. */
  private forward(event: RawRecord, installation?: RawRecord, processRecord?: RawRecord): void {
    this.counters.forwarded += 1;

    // The collector trusts qcontrol to emit schema-conforming records, so the
    // narrowing to the public event contract happens here in one place.
    for (const forwarder of this.forwarders) {
      forwarder.forward(
        event as QcontrolEvent,
        installation as QcontrolInstallation | undefined,
        processRecord as QcontrolProcess | undefined,
      );
    }
  }

  /**
   * Retains a waiting event under its missing dependency while bounding memory
   * per dependency and overall, so one unresolvable sender cannot evict events
   * that are waiting on healthy dependencies.
   */
  private park(queuedEvent: QueuedEvent, key: DependencyKey, isNewArrival: boolean): void {
    if (this.maxQueuedEvents <= 0 || this.maxQueuedEventsPerKey <= 0) {
      this.counters.evicted += 1;
      return;
    }

    let bucket = this.pending.get(key);
    if (!bucket) {
      bucket = [];
      this.pending.set(key, bucket);
    }

    if (bucket.length >= this.maxQueuedEventsPerKey) {
      bucket.shift();
      this.pendingCount -= 1;
      this.counters.evicted += 1;
    } else if (this.pendingCount >= this.maxQueuedEvents) {
      this.evictGloballyOldest();
    }

    bucket.push(queuedEvent);
    this.pendingCount += 1;
    if (isNewArrival) {
      this.counters.queued += 1;
    }
  }

  /** Frees one slot by dropping the longest-waiting event across all buckets. */
  private evictGloballyOldest(): void {
    let oldestKey: DependencyKey | undefined;
    let oldestBucket: QueuedEvent[] | undefined;
    let oldestExpiry = Infinity;

    for (const [key, bucket] of this.pending) {
      const head = bucket[0];
      if (head && head.expiresAt < oldestExpiry) {
        oldestExpiry = head.expiresAt;
        oldestKey = key;
        oldestBucket = bucket;
      }
    }

    if (oldestKey === undefined || !oldestBucket) {
      return;
    }

    oldestBucket.shift();
    this.pendingCount -= 1;
    this.counters.evicted += 1;
    if (oldestBucket.length === 0) {
      this.pending.delete(oldestKey);
    }
  }

  /**
   * Replays every event parked under a freshly resolved dependency. A replayed
   * process.started that registers its entity_id flushes that entity's bucket
   * in turn. Events still missing another dependency are re-parked under it
   * with their original deadline.
   */
  private flushPending(key: DependencyKey): void {
    const bucket = this.pending.get(key);
    if (!bucket) {
      return;
    }

    this.pending.delete(key);
    this.pendingCount -= bucket.length;

    const now = Date.now();
    for (const queuedEvent of bucket) {
      if (queuedEvent.expiresAt <= now) {
        this.counters.expired += 1;
        continue;
      }

      const result = this.tryForward(queuedEvent.event);
      if (result.status === "waiting") {
        this.park(queuedEvent, result.on, false);
      }
    }
  }

  /** Logs one summary line whenever events were shed since the last report. */
  private reportShedding(): void {
    const shed = this.counters.expired + this.counters.evicted;
    if (shed <= this.lastReportedShed) {
      return;
    }

    console.error(`collector shed ${String(shed - this.lastReportedShed)} unresolved events (expired or evicted); ${String(this.pendingCount)} still pending`);
    this.lastReportedShed = shed;
  }
}

/**
 * Splits incoming sink bytes into JSON records while preserving partial records
 * that span socket chunks.
 */
class EventConnection {
  private buffered = "";
  private readonly router: EventRouter;

  constructor(socket: Socket, router: EventRouter) {
    this.router = router;

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.collectRecords(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    socket.on("end", () => {
      this.flush();
    });
    socket.on("error", () => {
      // Broken senders should not take down the collector or other clients.
    });
  }

  /** Forwards all complete JSON records in a chunk and buffers an incomplete suffix. */
  private collectRecords(chunk: string): void {
    this.buffered += chunk;

    const records = this.buffered.split(/\r?\n/);
    this.buffered = records.pop() ?? "";

    for (const record of records) {
      if (record.length > 0) {
        this.forward(record);
      }
    }
  }

  /** Forwards a final unterminated record when the sender closes cleanly. */
  private flush(): void {
    if (this.buffered.length === 0) {
      return;
    }

    this.forward(this.buffered);
    this.buffered = "";
  }

  /**
   * Parses a socket record at the collector boundary so downstream forwarders do
   * not need to know about qcontrol's newline-delimited transport format.
   */
  private parseRecord(record: string): RawRecord | undefined {
    let event: unknown;

    try {
      event = JSON.parse(record) as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`dropping malformed qcontrol event: ${reason}`);
      return undefined;
    }

    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      console.error("dropping qcontrol event that did not parse to an object");
      return undefined;
    }

    return event as RawRecord;
  }

  /** Delivers an event object to the collector's dependency resolver. */
  private forward(record: string): void {
    const event = this.parseRecord(record);
    if (!event) {
      return;
    }

    this.router.route(event);
  }
}

/**
 * Listens on qctl's configured local sink and forwards qcontrol event records
 * until stopped by the owning process.
 */
export class Collector {
  private readonly router: EventRouter;
  private readonly platform: PlatformAdapter;
  private readonly socketMode?: number;
  private readonly socketPath: string;
  private server?: Server;

  constructor(options: CollectorOptions = {}) {
    this.platform = options.platform ?? platformAdapter;
    this.socketPath = options.socketPath ?? getQctlSocketPath(this.platform);
    this.socketMode = options.socketMode;
    this.router = new EventRouter({
      forwarders: options.forwarders ? [...options.forwarders] : [],
      queueTtlMs: options.queueTtlMs ?? DEFAULT_QUEUE_TTL_MS,
      maxQueuedEvents: options.maxQueuedEvents ?? DEFAULT_MAX_QUEUED_EVENTS,
      maxQueuedEventsPerKey: options.maxQueuedEventsPerKey ?? DEFAULT_MAX_QUEUED_EVENTS_PER_KEY,
      processEvictionGraceMs: options.processEvictionGraceMs ?? DEFAULT_PROCESS_EVICTION_GRACE_MS,
    });
  }

  /** Returns the local endpoint path that this collector binds when started. */
  get path(): string {
    return this.socketPath;
  }

  /** Returns routing counters and queue depth for health checks and tests. */
  get stats(): CollectorStats {
    return this.router.stats;
  }

  /** Returns the active socket server, if this instance currently owns one. */
  get listener(): Server | undefined {
    return this.server;
  }

  /** Binds the local stream sink and begins forwarding records from connections. */
  async start(): Promise<Server> {
    if (this.server?.listening) {
      return this.server;
    }

    await this.platform.prepareCollectorEndpoint(this.socketPath);

    const server = createServer((socket) => {
      new EventConnection(socket, this.router);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.socketPath);
    });

    if (this.socketMode !== undefined) {
      // A privileged daemon owns the socket file, but the elevated monitor still
      // needs to connect to the sink configured in the user's config.toml.
      await this.platform.applyCollectorMode(this.socketPath, this.socketMode);
    }

    this.router.startSweeping();
    this.server = server;
    return server;
  }

  /** Stops the owned socket server and removes its socket file. */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }

    this.router.stopSweeping();
    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await this.platform.cleanupCollectorEndpoint(this.socketPath);
  }
}
