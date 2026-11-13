import { EventEmitter } from "node:events";
import type * as NodeChildProcess from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRACK_ASYNC_SPAWN_ENV = "ANSIBLE_LS_TRACK_ASYNC_SPAWN";

const { mockSpawnImpl } = vi.hoisted(() => ({
  mockSpawnImpl: {
    current: null as null | (() => NodeChildProcess.ChildProcess),
  },
}));

vi.mock("child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("child_process")>();
  return {
    ...original,
    spawn: (...args: Parameters<typeof original.spawn>) => {
      if (mockSpawnImpl.current) {
        return mockSpawnImpl.current();
      }
      return original.spawn(...args);
    },
  };
});

import { asyncSpawn, terminateTrackedAsyncSpawns } from "@src/utils/misc.js";

describe("asyncSpawn tracking", () => {
  beforeEach(() => {
    mockSpawnImpl.current = null;
  });

  afterEach(() => {
    mockSpawnImpl.current = null;
    process.env[TRACK_ASYNC_SPAWN_ENV] = undefined;
    terminateTrackedAsyncSpawns();
  });

  it("SIGTERMs tracked children when tracking env is enabled", async () => {
    process.env[TRACK_ASYNC_SPAWN_ENV] = "1";
    const completion = asyncSpawn("sleep", ["30"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    terminateTrackedAsyncSpawns();
    await expect(completion).rejects.toThrow();
  });

  it("untracks children after spawn error", async () => {
    process.env[TRACK_ASYNC_SPAWN_ENV] = "1";
    await expect(
      asyncSpawn("__ansible_ls_nonexistent_spawn_binary__", []),
    ).rejects.toThrow();
    expect(() => terminateTrackedAsyncSpawns()).not.toThrow();
  });

  it("ignores proc.kill failures during termination", () => {
    process.env[TRACK_ASYNC_SPAWN_ENV] = "1";
    mockSpawnImpl.current = () => {
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => {
          throw new Error("kill failed");
        },
      });
      return proc as NodeChildProcess.ChildProcess;
    };

    void asyncSpawn("echo", ["tracked"]).catch(() => undefined);
    expect(() => terminateTrackedAsyncSpawns()).not.toThrow();
  });
});
