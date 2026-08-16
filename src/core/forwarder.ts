/**
 * Defines event forwarding targets used by the collector after it receives
 * qcontrol monitor records from the local collector endpoint, parses them into
 * the unified event schema, and attaches any installation/process context.
 */

import type {
  EventRecord,
  InstallationRecord,
  ProcessStarted,
} from "../types/qcontrol-events";

/** Represents a parsed qcontrol sink record from the unified monitor stream. */
export type QcontrolEvent = EventRecord;

/** Represents an installation payload emitted by an installation inventory event. */
export type QcontrolInstallation = InstallationRecord;

/**
 * Process context attached to forwarded events.
 *
 * `entity_id` is copied from the monitor envelope (or a snapshot entry). The
 * collector never invents this value.
 */
export type QcontrolProcess = ProcessStarted & {
  entity_id: string;
};

/**
 * Receives one parsed qcontrol event plus any dependency records the collector
 * could resolve before delivery. Implementations live in `src/forwarders`.
 */
export interface Forwarder {
  /** Handles one complete event emitted by qcontrol's monitor sink. */
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void;
}
