/* eslint-disable */
/**
 * Auto-generated qcontrol event types. Do not edit.
 */

/**
 * One event emitted by a third-party qcontrol plugin.
 */
export interface PluginEvent {
  /**
   * Plugin that emitted the event. Required and non-empty.
   */
  plugin_name: string;
  /**
   * Plugin socket event type. Required and non-empty.
   */
  type: string;
  /**
   * Direct event payload. Use `{}` when an event has no fields.
   */
  payload: {
    [k: string]: unknown;
  };
}
