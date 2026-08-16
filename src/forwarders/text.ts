/**
 * Shared string helpers for access-log style event lines. Pretty-print
 * summaries keep one terminal line, so these functions own truncation,
 * path shortening, and compact unit formatting.
 */

/** Single-character ellipsis so truncation costs one column, not three. */
const ELLIPSIS = "…";

/**
 * Caps a string to `max` columns, replacing the tail with an ellipsis when
 * the source would overflow the printer's line budget.
 */
export function truncate(text: string, max: number): string {
  if (max <= 0) {
    return "";
  }
  if (text.length <= max) {
    return text;
  }
  if (max === 1) {
    return ELLIPSIS;
  }

  return `${text.slice(0, max - 1)}${ELLIPSIS}`;
}

/**
 * Joins present, non-empty summary tokens with single spaces so optional
 * payload fields can drop out without leaving gaps.
 */
export function joinParts(
  ...parts: Array<string | number | null | undefined | false>
): string {
  return parts
    .filter((part): part is string | number => part !== undefined && part !== null && part !== false && part !== "")
    .map(String)
    .join(" ");
}

/** Returns the final path segment, accepting both POSIX and Windows separators. */
export function basename(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.at(-1) ?? path;
}

/**
 * Shrinks a filesystem path to fit a summary column. Short paths stay intact;
 * long ones keep the last two segments so the file and its parent remain
 * recognizable.
 */
export function shortPath(path: string, max = 40): string {
  if (path.length <= max) {
    return path;
  }

  const parts = path.replaceAll("\\", "/").split("/").filter((part) => part.length > 0);
  if (parts.length >= 2) {
    const tail = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    if (tail.length <= max) {
      return tail;
    }
  }

  return truncate(basename(path), max);
}

/**
 * Formats a millisecond duration as a compact access-log token (`230ms`,
 * `1.2s`, `1m5s`) so wall-clock fields stay scannable.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return `${ms}ms`;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds))}s`;
  }

  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${seconds}s`;
}

/**
 * Formats a byte count as a compact token (`512b`, `2kb`, `1.5mb`) for
 * IO and stream summaries.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes}b`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : String(Math.round(kb))}kb`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

/**
 * Quotes a text snippet for log display, collapsing whitespace and
 * truncating so prompts never dominate the line.
 */
export function quote(text: string, max = 40): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return `"${truncate(cleaned, max)}"`;
}
