/**
 * Defines event forwarding targets used by the collector after it receives
 * qcontrol sink records from the local Unix socket.
 */

/**
 * Receives one complete qcontrol sink record and delivers it to a downstream
 * destination owned by the implementation.
 */
export interface Forwarder {
  /** Handles one complete event record emitted by qcontrol's sink writer. */
  forward(event: string): void;
}

/**
 * Sends collected qcontrol sink records to stdout so local runs can inspect the
 * raw event stream without configuring another destination.
 */
export class ConsoleForwarder implements Forwarder {
  /** Prints the raw event record to stdout without interpreting its schema. */
  forward(event: string): void {
    console.log(event);
  }
}
