# Running the app as a daemonized service

A wrapper that is supposed to keep collecting after the terminal closes needs a placement story: detached process, or an OS service that comes back at boot.

This repo mirrors qcontrol's start surface so a white-label CLI feels familiar. You do not need any of these modes if your app is a GUI, a container, or someone else's supervisor.

## What this repo does

[`src/lifecycle/index.ts`](../src/lifecycle/index.ts) owns `qctl start`, `qctl stop`, and `qctl status`.

| Invocation | Placement |
|---|---|
| `qctl start` | Detach `qctl start -f` and return. |
| `qctl start -f` | Run the collector and monitor in this terminal. |
| `qctl start --service` | Register an OS service whose command is `qctl start -f`, and start it now. |
| `qctl status` | Report whether the recorded pid is alive. |
| `qctl stop` | Reverse the current placement, and unregister a service if one was registered. |

`--raw` combines with any of the start forms and is forwarded to the `start -f` child so its log stream matches.

`-f` / `--foreground` and `--service` are exclusive.

Every service backend runs the same in-process runtime: [`runForeground()`](../src/lifecycle/runtime.ts). The OS is only responsible for keeping that process alive.

## Elevation

On macOS and Linux, `start` and `stop` re-exec the wrapper through `sudo` when the current process is not already root. The config tree is created *before* that re-exec so the invoking user owns the directories.

`status` is a local pid-file check. It does not sudo.

`--service` must run from the compiled `qctl` binary, not `bun run src/main.ts`. The registered unit has to exec a real path that will still exist after the shell exits. [`isCompiledWrapper()`](../src/lifecycle/process.ts) enforces that.

Windows does not elevate in this app (`canElevateMonitor()` is false).

## Backends

The platform adapter picks the service manager. [`src/lifecycle/state.ts`](../src/lifecycle/state.ts) records which one was used (`service.manager`) plus the runtime pid (`start.pid`) so `stop` does not guess.

### Detached (`start`)

[`src/lifecycle/direct.ts`](../src/lifecycle/direct.ts) spawns `qctl start -f` with `detached: true`, writes the pid, and appends stdout/stderr to `{data}/start.log`.

`stop` sends `SIGTERM` and waits up to ten seconds.

### macOS LaunchDaemon (`start --service`)

[`src/lifecycle/macos.ts`](../src/lifecycle/macos.ts) writes `/Library/LaunchDaemons/com.qpoint.qctl.plist` and bootstraps `system/com.qpoint.qctl`. The job is `KeepAlive` on crash, `RunAtLoad`, logs under `/Library/Logs/qctl`. The plist copies the invoking user's `HOME`, `SUDO_USER`, and `QCTL_*` / `QCONTROL_*` directories so the daemon still uses the user's config tree.

`stop` boots the job out and removes the plist.

### Linux systemd (`start --service`)

[`src/lifecycle/linux.ts`](../src/lifecycle/linux.ts) writes `/etc/systemd/system/qctl.service` (`Type=simple`, `Restart=on-failure`) and `/etc/qctl/monitor.env` with the same user directory variables. It enables the unit and starts it now.

`stop` disables the unit and removes the file.

### Windows SCM (`start --service`)

[`src/lifecycle/windows.ts`](../src/lifecycle/windows.ts) creates a demand-start LocalSystem service named `qctl` whose `binPath` is `qctl start -f`. There is no extra native service host in this repo. SCM may still expect the service protocol from a more complete Windows integration; treat this file as a sketch of registration, not a finished Windows service.

`stop` deletes the registration.

## Status

`qctl status` reads the pid file. A live pid prints `qctl is running (pid …)`. A missing or dead pid prints `qctl is offline` (including a stale file after a crash). It does not query launchd, systemd, or SCM.

## What you can ignore

- All three service managers. `start -f` under your own supervisor is enough.
- Matching qcontrol's flag surface. Name the commands whatever your product uses.
- The pid file / marker scheme. Query the real service manager if you prefer.
- Windows SCM support. This repo's example is thinnest there.
- LaunchDaemon labels, unit names, and log paths. Those are this example's identifiers, not qcontrol's.
