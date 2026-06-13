import { beforeEach, describe, expect, test } from "bun:test";

import { createInstallationActions } from "../src/installation";

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
  });

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
    });

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
    });

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
    });

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
    });

    const exitCode = await actions.install();

    expect(exitCode).toBe(0);
    expect(order).toEqual(["qcontrol-system", "launchd", "qcontrol-user", "sink"]);
  });
});
