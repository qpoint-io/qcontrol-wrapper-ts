/**
 * Prints each collected event as a single JSON line so local runs can inspect
 * the raw stream without configuring another destination.
 */
import type {
  Forwarder,
  QcontrolEvent,
  QcontrolInstallation,
  QcontrolProcess,
} from "../core/forwarder";

/**
 * Event plus resolved context, omitting a context record that the payload
 * already is (installation.* and process.* events).
 */
export type RawEvent = QcontrolEvent & {
  installation?: QcontrolInstallation;
  process?: QcontrolProcess;
};

/**
 * Default forwarder: write the parsed event to stdout with any resolved
 * installation and process context embedded on the same record.
 */
export class RawPrinter implements Forwarder {
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
    const record: RawEvent = {
      ...event,
      ...(installation && this.shouldInjectInstallation(event) ? { installation } : {}),
      ...(process && this.shouldInjectProcess(event) ? { process } : {}),
    };

    console.log(JSON.stringify(record));
  }
}
