/**
 * Product forwarders that receive events after the collector has resolved
 * installation and process context. The Forwarder contract lives in core;
 * implementations live here.
 */
export { RawPrinter, type RawEvent } from "./raw";
export {
  PrettyPrinter,
  formatEventLine,
  DEFAULT_LINE_WIDTH,
  type PrettyPrinterOptions,
} from "./pretty";
export { summarizeEvent } from "./summarize";
