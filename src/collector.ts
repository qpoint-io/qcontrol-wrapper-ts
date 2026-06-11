/**
 * Owns qctl's Unix socket event collector, which receives qcontrol sink records
 * from the configured socket path and dispatches each record to forwarders.
 */
import { chmod, lstat, mkdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";

import { ConsoleForwarder, type Forwarder } from "./forwarder";
import { getQctlSocketPath } from "./installation";

/** Configures socket ownership and forwarding behavior for a collector instance. */
export interface CollectorOptions {
  socketPath?: string;
  socketMode?: number;
  forwarders?: Forwarder[];
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

/**
 * Splits incoming sink bytes into printable records while preserving partial
 * records that span socket chunks.
 */
class EventConnection {
  private buffered = "";
  private readonly forwarders: Forwarder[];

  constructor(socket: Socket, forwarders: Forwarder[]) {
    this.forwarders = forwarders;

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.printRecords(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    socket.on("end", () => {
      this.flush();
    });
    socket.on("error", () => {
      // Broken senders should not take down the collector or other clients.
    });
  }

  /** Forwards all complete records in a chunk and buffers an incomplete suffix. */
  private printRecords(chunk: string): void {
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

  /** Delivers an event to each configured destination in collector order. */
  private forward(event: string): void {
    for (const forwarder of this.forwarders) {
      forwarder.forward(event);
    }
  }
}

/**
 * Listens on qctl's configured Unix socket sink and forwards qcontrol event
 * records until stopped by the owning process.
 */
export class Collector {
  private readonly forwarders: Forwarder[];
  private readonly socketMode?: number;
  private readonly socketPath: string;
  private server?: Server;

  constructor(options: CollectorOptions = {}) {
    this.socketPath = options.socketPath ?? getQctlSocketPath();
    this.socketMode = options.socketMode;
    this.forwarders = options.forwarders ? [...options.forwarders] : [new ConsoleForwarder()];
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
      new EventConnection(socket, this.forwarders);
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
