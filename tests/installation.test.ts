import { beforeEach, describe, expect, test } from "bun:test";

import { createInstallationActions } from "../src/installation";
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

  test("Windows lifecycle commands report unsupported without mutating host state", async () => {
    const { actions, rootCommands, rootQcontrolCalls } = createActions();
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };

    const windowsActions = createInstallationActions(actions.dependencies, createPlatformAdapter("win32"));
    try {
      await expect(windowsActions.install()).resolves.toBe(1);
      await expect(windowsActions.installSystem()).resolves.toBe(1);
      await expect(windowsActions.start()).resolves.toBe(1);
      await expect(windowsActions.stop()).resolves.toBe(1);
      await expect(windowsActions.uninstall()).resolves.toBe(1);
    } finally {
      console.error = originalError;
    }

    expect(rootCommands).toEqual([]);
    expect(rootQcontrolCalls).toEqual([]);
    expect(errors).toContain("qctl install is not supported on Windows; run qctl daemon in the foreground instead.");
    expect(errors).toContain("qctl start is not supported on Windows; run qctl daemon in the foreground instead.");
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
    } finally {
      console.error = originalError;
    }

    expect(rootCommands).toEqual([]);
    expect(rootQcontrolCalls).toEqual([]);
    expect(errors).toContain("qctl install is not supported on Linux; run qctl daemon in the foreground instead.");
    expect(errors).toContain("qctl start is not supported on Linux; run qctl daemon in the foreground instead.");
  });
});
