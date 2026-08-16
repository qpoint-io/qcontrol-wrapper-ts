# Re-generating a snapshot if the listener gets stale

## What is a snapshot

As agents are installed and started, qcontrol emits `installation.*` and `process.*` events in realtime. Your listener applies those one at a time: a new install, a process start, a process stop.

A snapshot is the same information, all at once: the entire installed set and the entire running set, right now. Those individual events already happened — maybe before you were listening — so the snapshot is how you catch up without replaying history.

On the wire that is two records on the same sink as everything else:

- `installation.snapshot` — every installed agent (`payload.installations`)
- `process.snapshot` — every running process (`payload.processes`, each entry already carrying `entity_id`)

They populate the same two maps as the incremental events: `installation_id → installation` and `entity_id → entity`. See [How events join](event-schema.md#how-events-join).

## When to generate a new one

A fresh snapshot can be generated at any time. You need one when your listener's maps no longer match the machine:

- The listener got stale: it restarted, the socket dropped, or you attached to a monitor that has been up for a while.
- The machine went to sleep (or otherwise paused) and you want a clean picture of what is still installed and running.

If you follow the recommended order — [bind the collector, then start qcontrol](handling-events.md) — the monitor already emits snapshots at startup. You do not need to request anything on a clean boot.

Without a snapshot, incremental `process.started` / `process.stopped` events cannot reconstruct processes that were already running. Run events then cannot join `entity_id → entity` (or from there to the installation), and they sit in the [unresolved queue](handling-events.md) until they expire.

## What this collector does with them

In [`src/core/collector.ts`](../src/core/collector.ts):

- `installation.snapshot` **clears** the installation index and rebuilds it from the payload. Pending events waiting on those installation ids are flushed.
- `process.snapshot` **clears** the process index and any stop-grace deadlines, then rebuilds from the payload. Pending events waiting on those `entity_id`s are flushed.

They are replacements, not merges. That is the point: after a snapshot, the collector matches the monitor, not "the monitor plus whatever we remembered from before the disconnect."

The snapshot events themselves are also forwarded, so a `Forwarder` can refresh its own state.

## How to request one

qcontrol's flag is `qcontrol monitor --snapshot`. Through this wrapper that is a passthrough:

```sh
qctl monitor --snapshot
```

That command uses the same materialized binary and `QCONTROL_*` directories as the running monitor, so it talks to the monitor this app started.

You can also exec the materialized qcontrol binary directly if your product does not expose passthrough.

Request the snapshot *after* the new collector is listening. A snapshot delivered to a down socket does not help.

## What you can ignore

- Implementing snapshot events yourself if you do not keep inventory. Handle only the event types you store, and treat a snapshot as "forget everything, here is the current set" or ignore it.
- Calling `--snapshot` on every startup. A monitor you just launched will already emit them.
- This collector's replace-and-flush behavior. If you write your own listener, apply the same rule: snapshot means replace.
