/**
 * Defines event forwarding targets used by the collector after it receives
 * qcontrol sink records from the local Unix socket, parses them into events,
 * and resolves installation/process dependencies for downstream consumers.
 */

/** Represents a parsed qcontrol event whose concrete schema is owned upstream. */
export type QcontrolEvent = Record<string, unknown>;

/** Represents an installation payload emitted by an installation discovery event. */
export type QcontrolInstallation = Record<string, unknown>;

/** Represents a process payload emitted by a process start event. */
export type QcontrolProcess = Record<string, unknown>;

/**
 * Receives one parsed qcontrol event plus any dependency records the collector
 * could resolve before delivery.
 */
export interface Forwarder {
  /** Handles one complete event emitted by qcontrol's sink writer. */
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void;
}

/**
 * Sends collected qcontrol events to stdout so local runs can inspect the event
 * stream without configuring another destination.
 */
export class ConsoleForwarder implements Forwarder {
  /** Identifies event families whose payload already carries the installation. */
  private shouldInjectInstallation(event: QcontrolEvent): boolean {
    return typeof event.type !== "string" || !event.type.startsWith("installation.");
  }

  /** Identifies process events whose payload already carries the process record. */
  private shouldInjectProcess(event: QcontrolEvent): boolean {
    return typeof event.type !== "string" || !event.type.startsWith("process.");
  }

  /** Prints the parsed event with resolved context embedded for log consumers. */
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void {
    console.log(JSON.stringify({
      ...event,
      ...(installation && this.shouldInjectInstallation(event) ? { installation } : {}),
      ...(process && this.shouldInjectProcess(event) ? { process } : {}),
    }));
  }
}
