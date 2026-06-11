/**
 * Owns qctl's Unix socket event collector, which receives qcontrol sink records
 * from the configured socket path, resolves event dependencies, and dispatches
 * complete event records to forwarders.
 */
import { chmod, lstat, mkdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";

import {
  ConsoleForwarder,
  type Forwarder,
  type QcontrolEvent,
  type QcontrolInstallation,
  type QcontrolProcess,
} from "./forwarder";
import { getQctlSocketPath } from "./installation";

const DEFAULT_QUEUE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_QUEUED_EVENTS = 10_000;

/**
 * Raw socket record before the collector vouches for its shape. Records are
 * only narrowed to the public QcontrolEvent contract when handed to
 * forwarders, so all defensive field reads stay on this loose type.
 */
type RawRecord = Record<string, unknown>;

/** Configures socket ownership and forwarding behavior for a collector instance. */
export interface CollectorOptions {
  socketPath?: string;
  socketMode?: number;
  forwarders?: Forwarder[];
  queueTtlMs?: number;
  maxQueuedEvents?: number;
}

/** Tracks an unresolved event until its installation and process can be found. */
interface QueuedEvent {
  event: RawRecord;
  expiresAt: number;
}

/** Narrows filesystem failures to Node errno errors without trusting throws. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/**
 * Removes a stale Unix socket while refusing to unlink regular files that may
 * have been created by a user or another qctl component.
 */
async function removeStaleSocket(socketPath: string): Promise<void> {
  try {
    const socketStat = await lstat(socketPath);
    if (!socketStat.isSocket()) {
      throw new Error(`refusing to replace non-socket path: ${socketPath}`);
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    return;
  }

  await rm(socketPath);
}

/** Confirms a parsed value is an object payload that can carry qcontrol fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the event payload only when qcontrol provided an object payload. */
function getPayload(event: RawRecord): RawRecord | undefined {
  return isRecord(event.payload) ? event.payload : undefined;
}

/** Returns the qcontrol run block that carries dependencies for runtime events. */
function getRun(event: RawRecord): RawRecord | undefined {
  return isRecord(event.run) ? event.run : undefined;
}

/** Reads a required string identifier from a payload without coercing bad data. */
function getStringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Reads a required numeric identifier from a payload without coercing bad data. */
function getNumberField(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Finds the installation dependency using the schema appropriate to the event. */
function getDependencyInstallationId(event: RawRecord): string | undefined {
  const run = getRun(event);
  const payload = getPayload(event);

  return (run && getStringField(run, "installation_id")) ?? (payload && getStringField(payload, "installation_id"));
}

/** Finds the process dependency using run metadata before legacy payload fields. */
function getDependencyPid(event: RawRecord): number | undefined {
  const run = getRun(event);
  const payload = getPayload(event);

  return (run && getNumberField(run, "agent_pid")) ?? (run && getNumberField(run, "run_pid")) ?? (payload && getNumberField(payload, "pid"));
}

/**
 * Resolves qcontrol event dependencies by indexing root installation and process
 * events, then holding dependent records until both indexes can satisfy them.
 */
class EventRouter {
  private readonly forwarders: Forwarder[];
  private readonly installations = new Map<string, RawRecord>();
  private readonly maxQueuedEvents: number;
  private readonly processes = new Map<number, RawRecord>();
  private readonly queueTtlMs: number;
  private queuedEvents: QueuedEvent[] = [];

  constructor(forwarders: Forwarder[], queueTtlMs: number, maxQueuedEvents: number) {
    this.forwarders = forwarders;
    this.queueTtlMs = queueTtlMs;
    this.maxQueuedEvents = maxQueuedEvents;
  }

  /** Resolves, forwards, or queues one parsed qcontrol event. */
  route(event: RawRecord): void {
    const now = Date.now();
    this.expireQueuedEvents(now);

    if (this.tryForward(event)) {
      this.retryQueuedEvents();
      return;
    }

    this.queue(event, now);
  }

  /**
   * Attempts delivery without retaining unresolved events; callers decide whether
   * an unresolved record belongs in the pending queue.
   */
  private tryForward(event: RawRecord): boolean {
    switch (event.type) {
      case "installation.discovered":
        return this.forwardInstallationDiscovered(event);
      case "process.started":
        return this.forwardProcessStarted(event);
      default:
        return this.forwardDependentEvent(event);
    }
  }

  /** Stores a discovered installation and forwards the event with itself attached. */
  private forwardInstallationDiscovered(event: RawRecord): boolean {
    const installation = getPayload(event);
    const installationId = installation ? getStringField(installation, "id") : undefined;
    if (!installation || !installationId) {
      console.error("dropping installation.discovered event without payload.id");
      return true;
    }

    this.installations.set(installationId, installation);
    this.forward(event, installation);
    return true;
  }

  /** Stores a started process after its installation is available. */
  private forwardProcessStarted(event: RawRecord): boolean {
    const processRecord = getPayload(event);
    const installationId = processRecord ? getStringField(processRecord, "installation_id") : undefined;
    const pid = processRecord ? getNumberField(processRecord, "pid") : undefined;
    if (!processRecord || !installationId || pid === undefined) {
      console.error("dropping process.started event without payload.installation_id or payload.pid");
      return true;
    }

    // Add entity_id as a globally unique identifier for the process.
    const startedAtMs = Date.parse(String(processRecord.started_at));
    const startSecs = Number.isFinite(startedAtMs) ? Math.floor(startedAtMs / 1000) : 0;
    processRecord.entity_id = `pid:${String(pid)}:start:${String(startSecs)}`;

    const installation = this.installations.get(installationId);
    if (!installation) {
      return false;
    }

    this.processes.set(pid, processRecord);
    this.forward(event, installation, processRecord);
    return true;
  }

  /** Forwards non-root events only after both installation and process exist. */
  private forwardDependentEvent(event: RawRecord): boolean {
    const installationId = getDependencyInstallationId(event);
    const pid = getDependencyPid(event);
    if (!installationId || pid === undefined) {
      console.error(`dropping qcontrol event without process dependencies: ${String(event.type)}`);
      return true;
    }

    const processRecord = this.processes.get(pid);
    const processInstallationId = processRecord ? getStringField(processRecord, "installation_id") : undefined;
    const installation = this.installations.get(installationId) ?? (processInstallationId ? this.installations.get(processInstallationId) : undefined);
    if (!installation || !processRecord) {
      return false;
    }

    this.forward(event, installation, processRecord);
    return true;
  }

  /** Delivers a resolved event to each configured destination in collector order. */
  private forward(event: RawRecord, installation?: RawRecord, processRecord?: RawRecord): void {
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

  /** Retains an unresolved event while bounding memory by count and age. */
  private queue(event: RawRecord, now: number): void {
    if (this.maxQueuedEvents <= 0) {
      return;
    }

    if (this.queuedEvents.length >= this.maxQueuedEvents) {
      this.queuedEvents.shift();
    }

    this.queuedEvents.push({
      event,
      expiresAt: now + this.queueTtlMs,
    });
  }

  /** Removes queued events whose dependencies did not arrive before the TTL. */
  private expireQueuedEvents(now: number): void {
    if (this.queuedEvents.length === 0) {
      return;
    }

    const retained: QueuedEvent[] = [];
    for (const queuedEvent of this.queuedEvents) {
      if (queuedEvent.expiresAt > now) {
        retained.push(queuedEvent);
      }
    }

    this.queuedEvents = retained;
  }

  /**
   * Replays queued events until the latest installation/process discovery stops
   * unlocking more pending records.
   */
  private retryQueuedEvents(): void {
    let madeProgress = true;

    while (madeProgress) {
      madeProgress = false;
      this.expireQueuedEvents(Date.now());

      const unresolved: QueuedEvent[] = [];
      for (const queuedEvent of this.queuedEvents) {
        if (this.tryForward(queuedEvent.event)) {
          madeProgress = true;
        } else {
          unresolved.push(queuedEvent);
        }
      }

      this.queuedEvents = unresolved;
    }
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
 * Listens on qctl's configured Unix socket sink and forwards qcontrol event
 * records until stopped by the owning process.
 */
export class Collector {
  private readonly router: EventRouter;
  private readonly socketMode?: number;
  private readonly socketPath: string;
  private server?: Server;

  constructor(options: CollectorOptions = {}) {
    this.socketPath = options.socketPath ?? getQctlSocketPath();
    this.socketMode = options.socketMode;
    this.router = new EventRouter(
      options.forwarders ? [...options.forwarders] : [new ConsoleForwarder()],
      options.queueTtlMs ?? DEFAULT_QUEUE_TTL_MS,
      options.maxQueuedEvents ?? DEFAULT_MAX_QUEUED_EVENTS,
    );
  }

  /** Returns the socket file path that this collector binds when started. */
  get path(): string {
    return this.socketPath;
  }

  /** Returns the active socket server, if this instance currently owns one. */
  get listener(): Server | undefined {
    return this.server;
  }

  /** Binds the Unix socket sink and begins forwarding records from connections. */
  async start(): Promise<Server> {
    if (this.server?.listening) {
      return this.server;
    }

    await mkdir(dirname(this.socketPath), { recursive: true });
    await removeStaleSocket(this.socketPath);

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
      // The launchd root daemon owns the socket file, but user qcontrol runs
      // still need to connect to the sink configured in the user's run.toml.
      await chmod(this.socketPath, this.socketMode);
    }

    this.server = server;
    return server;
  }

  /** Stops the owned socket server and removes its socket file. */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }

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

    await removeStaleSocket(this.socketPath);
  }
}
