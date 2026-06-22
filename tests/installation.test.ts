import { beforeEach, describe, expect, test } from "bun:test";

import { createInstallationActions } from "../src/installation";
import { createWindowsLifecycleActions, type WindowsServiceState } from "../src/lifecycle/windows";
import { createPlatformAdapter } from "../src/platform";

beforeEach(() => {
  process.env.QCTL_EXECUTABLE = "/usr/local/bin/qctl";
});

function createActions() {
  const qcontrolCalls: unknown[] = [];
  const rootQcontrolCalls: unknown[] = [];
  const rootCommands: string[][] = [];
  const configWrites: string[] = [];

  const actions = createInstallationActions({
    appendQctlSinkConfig: async () => {
      configWrites.push("append-qctl-sink");
    },
    installLaunchDaemon: async () => 0,
    removeQctlSinkConfig: async () => {},
    removeLaunchDaemon: async () => 0,
    runQcontrol: async (options) => {
      qcontrolCalls.push(options);
      return 0;
    },
    runQcontrolAsRoot: async (options) => {
      rootQcontrolCalls.push(options);
      return 0;
    },
    runAsRoot: async (command) => {
      rootCommands.push(command);
      return 0;
    },
  }, createPlatformAdapter("darwin"));

  return { actions, configWrites, qcontrolCalls, rootCommands, rootQcontrolCalls };
}

function createWindowsActions(initialState: WindowsServiceState = "missing", elevated = true) {
  const qcontrolCalls: unknown[] = [];
  const commands: string[][] = [];
  const configWrites: string[] = [];
  const elevatedCommands: string[][] = [];
  const order: string[] = [];
  let serviceState = initialState;

  const actions = createWindowsLifecycleActions({
    appendQctlSinkConfig: async () => {
      order.push("sink");
      configWrites.push("append-qctl-sink");
    },
    installLaunchDaemon: async () => 0,
    removeQctlSinkConfig: async () => {
      order.push("remove-sink");
      configWrites.push("remove-qctl-sink");
    },
    removeLaunchDaemon: async () => 0,
    runQcontrol: async (options) => {
      order.push(options?.args?.join(" ") === "init --system" ? "qcontrol-system" : "qcontrol-user");
      qcontrolCalls.push(options);
      return 0;
    },
    runQcontrolAsRoot: async () => 0,
    runAsRoot: async () => 0,
  }, {
    ensureServiceDirectories: async () => {
      order.push("service-dirs");
    },
    getQctlExecutablePath: () => "C:\\Program Files\\qctl\\qctl.exe",
    getServiceHostPath: () => "C:\\Program Files\\qctl\\qctl-service.exe",
    isElevated: async () => elevated,
    readServiceState: async () => serviceState,
    runCommand: async (command) => {
      order.push(command[1] === "delete" ? "service-delete" : `service-${command[1]}`);
      commands.push(command);
      if (command[1] === "create") {
        serviceState = "stopped";
      } else if (command[1] === "start") {
        serviceState = "running";
      } else if (command[1] === "stop") {
        serviceState = "stopped";
      } else if (command[1] === "delete") {
        serviceState = "missing";
      }
      return 0;
    },
    runElevated: async (args) => {
      order.push(`elevated-${args.join(" ")}`);
      elevatedCommands.push(args);
      return 0;
    },
    serviceDescription: "Collects qcontrol events and forwards them through qctl.",
    serviceDisplayName: "qctl",
    serviceName: "qctl",
    startTimeoutMs: 1,
    stopPollIntervalMs: 0,
    stopTimeoutMs: 1,
  });

  return { actions, commands, configWrites, elevatedCommands, order, qcontrolCalls };
}

describe("installation split init", () => {
  test("installSystem runs qcontrol init --system before installing launchd assets", async () => {
    const order: string[] = [];
    const rootQcontrolCalls: unknown[] = [];
    const actions = createInstallationActions({
      appendQctlSinkConfig: async () => {},
      installLaunchDaemon: async () => {
        order.push("launchd");
        return 0;
      },
      removeQctlSinkConfig: async () => {},
      removeLaunchDaemon: async () => 0,
      runQcontrol: async () => 0,
      runQcontrolAsRoot: async (options) => {
        order.push("qcontrol-system");
        rootQcontrolCalls.push(options);
        return 0;
      },
      runAsRoot: async () => 0,
    }, createPlatformAdapter("darwin"));

    const exitCode = await actions.installSystem();

    expect(exitCode).toBe(0);
    expect(order).toEqual(["qcontrol-system", "launchd"]);
    expect(rootQcontrolCalls).toEqual([{ args: ["init", "--system"] }]);
  });

  test("installSystem stops before launchd install when system init fails", async () => {
    const order: string[] = [];
    const actions = createInstallationActions({
      appendQctlSinkConfig: async () => {},
      installLaunchDaemon: async () => {
        order.push("launchd");
        return 0;
      },
      removeQctlSinkConfig: async () => {},
      removeLaunchDaemon: async () => 0,
      runQcontrol: async () => 0,
      runQcontrolAsRoot: async () => {
        order.push("qcontrol-system");
        return 42;
      },
      runAsRoot: async () => 0,
    }, createPlatformAdapter("darwin"));

    const exitCode = await actions.installSystem();

    expect(exitCode).toBe(42);
    expect(order).toEqual(["qcontrol-system"]);
  });

  test("initUser runs qcontrol init --user before appending qctl sink", async () => {
    const order: string[] = [];
    const qcontrolCalls: unknown[] = [];
    const actions = createInstallationActions({
      appendQctlSinkConfig: async () => {
        order.push("sink");
      },
      installLaunchDaemon: async () => 0,
      removeQctlSinkConfig: async () => {},
      removeLaunchDaemon: async () => 0,
      runQcontrol: async (options) => {
        order.push("qcontrol-user");
        qcontrolCalls.push(options);
        return 0;
      },
      runQcontrolAsRoot: async () => 0,
      runAsRoot: async () => 0,
    }, createPlatformAdapter("darwin"));

    const exitCode = await actions.initUser();

    expect(exitCode).toBe(0);
    expect(order).toEqual(["qcontrol-user", "sink"]);
    expect(qcontrolCalls).toEqual([{ args: ["init", "--user"] }]);
  });

  test("initUser skips qctl sink when user init fails", async () => {
    const { actions, configWrites } = createActions();
    actions.dependencies.runQcontrol = async () => 7;

    const exitCode = await actions.initUser();

    expect(exitCode).toBe(7);
    expect(configWrites).toEqual([]);
  });

  test("install composes system and user setup", async () => {
    const order: string[] = [];
    const actions = createInstallationActions({
      appendQctlSinkConfig: async () => {
        order.push("sink");
      },
      installLaunchDaemon: async () => {
        order.push("launchd");
        return 0;
      },
      removeQctlSinkConfig: async () => {},
      removeLaunchDaemon: async () => 0,
      runQcontrol: async () => {
        order.push("qcontrol-user");
        return 0;
      },
      runQcontrolAsRoot: async () => {
        order.push("qcontrol-system");
        return 0;
      },
      runAsRoot: async () => 0,
    }, createPlatformAdapter("darwin"));

    const exitCode = await actions.install();

    expect(exitCode).toBe(0);
    expect(order).toEqual(["qcontrol-system", "launchd", "qcontrol-user", "sink"]);
  });

  test("Windows installSystem runs system init before registering the SCM service", async () => {
    const { actions, commands, order, qcontrolCalls } = createWindowsActions();

    const exitCode = await actions.installSystem();

    expect(exitCode).toBe(0);
    expect(order).toEqual([
      "qcontrol-system",
      "service-dirs",
      "service-create",
      "service-description",
      "service-failure",
    ]);
    expect(qcontrolCalls).toEqual([
      expect.objectContaining({
        args: ["init", "--system"],
        cacheDir: "C:\\ProgramData\\qctl\\cache",
        env: expect.objectContaining({
          QCTL_SOCKET_PATH: "qctl-collector",
        }),
      }),
    ]);
    expect(commands[0]).toEqual([
      "sc.exe",
      "create",
      "qctl",
      "binPath=",
      "\"C:\\Program Files\\qctl\\qctl-service.exe\"",
      "start=",
      "demand",
      "obj=",
      "LocalSystem",
      "DisplayName=",
      "qctl",
    ]);
  });

  test("Windows installSystem updates an existing SCM service", async () => {
    const { actions, commands } = createWindowsActions("stopped");

    const exitCode = await actions.installSystem();

    expect(exitCode).toBe(0);
    expect(commands[0]?.slice(0, 4)).toEqual(["sc.exe", "config", "qctl", "binPath="]);
  });

  test("Windows install composes system setup and current-user setup", async () => {
    const { actions, order } = createWindowsActions();

    const exitCode = await actions.install();

    expect(exitCode).toBe(0);
    expect(order).toEqual([
      "qcontrol-system",
      "service-dirs",
      "service-create",
      "service-description",
      "service-failure",
      "qcontrol-user",
      "sink",
    ]);
  });

  test("Windows lifecycle commands start stop and delete the SCM service", async () => {
    const { actions, commands, configWrites } = createWindowsActions("stopped");

    await expect(actions.start()).resolves.toBe(0);
    await expect(actions.stop()).resolves.toBe(0);
    await expect(actions.uninstall()).resolves.toBe(0);

    expect(commands.map((command) => command.slice(0, 3))).toEqual([
      ["sc.exe", "start", "qctl"],
      ["sc.exe", "stop", "qctl"],
      ["sc.exe", "delete", "qctl"],
    ]);
    expect(configWrites).toEqual(["remove-qctl-sink"]);
  });

  test("Windows uninstallSystem removes the service without removing user sink config", async () => {
    const { actions, commands, configWrites } = createWindowsActions("running");

    await expect(actions.uninstallSystem()).resolves.toBe(0);

    expect(commands.map((command) => command.slice(0, 3))).toEqual([
      ["sc.exe", "stop", "qctl"],
      ["sc.exe", "delete", "qctl"],
    ]);
    expect(configWrites).toEqual([]);
  });

  test("Windows start prompts for elevation before mutating SCM from a non-admin shell", async () => {
    const { actions, commands, elevatedCommands } = createWindowsActions("stopped", false);

    await expect(actions.start()).resolves.toBe(0);

    expect(commands).toEqual([]);
    expect(elevatedCommands).toEqual([["start"]]);
  });

  test("Linux lifecycle commands report unsupported without using launchd", async () => {
    const { actions, rootCommands, rootQcontrolCalls } = createActions();
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };

    const linuxActions = createInstallationActions(actions.dependencies, createPlatformAdapter("linux"));
    try {
      await expect(linuxActions.install()).resolves.toBe(1);
      await expect(linuxActions.installSystem()).resolves.toBe(1);
      await expect(linuxActions.start()).resolves.toBe(1);
      await expect(linuxActions.stop()).resolves.toBe(1);
      await expect(linuxActions.uninstall()).resolves.toBe(1);
      await expect(linuxActions.uninstallSystem()).resolves.toBe(1);
    } finally {
      console.error = originalError;
    }

    expect(rootCommands).toEqual([]);
    expect(rootQcontrolCalls).toEqual([]);
    expect(errors).toContain("qctl install is not supported on Linux; run qctl daemon in the foreground instead.");
    expect(errors).toContain("qctl start is not supported on Linux; run qctl daemon in the foreground instead.");
  });
});
