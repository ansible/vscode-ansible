import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn } from "node:child_process";

// Mock child_process before importing the module
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

// Import after mocking
import {
  executeCommand,
  checkADEInstalled,
  checkADTInstalled,
  getEnvironmentInfo,
  setupDevelopmentEnvironment,
  checkAndInstallADT,
  formatEnvironmentInfo,
  createVirtualEnvironment,
  executeInVirtualEnvironment,
  installCollections,
  installRequirements,
  checkConflictingPackages,
  checkAnsibleLint,
  checkPythonVersionAvailable,
  reportMissingPython,
  type ADEEnvironmentInfo,
} from "../../src/tools/adeTools.js";
import * as fs from "node:fs/promises";

describe("ADE Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeCommand", () => {
    it("should handle null exit code", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(null), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await executeCommand("command");
      expect(result.exitCode).toBe(0);
    });

    it("should handle undefined exit code", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(undefined), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await executeCommand("command");
      expect(result.exitCode).toBe(0);
    });

    it("should handle null stdout/stderr", async () => {
      const mockChild = {
        stdout: null,
        stderr: null,
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await executeCommand("command");
      expect(result.success).toBe(true);
      expect(result.output).toBe("");
    });

    it("should execute a command successfully", async () => {
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("output text"), 5);
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await executeCommand("python", ["--version"]);
      expect(result.success).toBe(true);
      expect(result.output).toBe("output text");
    });

    it("should handle command errors", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("error text"), 5);
            }
          }),
        },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(1), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await executeCommand("invalid-command");
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe("error text");
    });

    it("should handle spawn error event", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "error") {
            setTimeout(() => callback(new Error("Spawn error")), 5);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await executeCommand("bad-command");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Spawn error");
      expect(result.exitCode).toBe(1);
    });

    it("should handle spawn exceptions", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error("Cannot spawn");
      });

      const result = await executeCommand("bad-command");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot spawn");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("checkPythonVersionAvailable", () => {
    it("should return true when Python version is available", async () => {
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Python 3.11.0"), 5);
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await checkPythonVersionAvailable("3.11");
      expect(result).toBe(true);
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "python3.11",
        ["--version"],
        expect.anything(),
      );
    });

    it("should return false when Python version is not available", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(1), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await checkPythonVersionAvailable("3.15");
      expect(result).toBe(false);
    });

    it("should use python3 when no version specified", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await checkPythonVersionAvailable();
      expect(result).toBe(true);
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "python3",
        ["--version"],
        expect.anything(),
      );
    });
  });

  describe("reportMissingPython", () => {
    it("should return error with requirements info", () => {
      const result = reportMissingPython("3.11");
      expect(result.success).toBe(false);
      expect(result.output).toContain("Python 3.11 is not available");
      expect(result.output).toContain("Requirements:");
      expect(result.output).toContain(
        "Python 3.11 must be installed and available in PATH",
      );
      expect(result.error).toContain("Python 3.11 is not available");
    });

    it("should work with different Python versions", () => {
      const result = reportMissingPython("3.12");
      expect(result.success).toBe(false);
      expect(result.output).toContain("Python 3.12 is not available");
      expect(result.output).toContain(
        "Python 3.12 must be installed and available in PATH",
      );
    });
  });

  describe("checkADEInstalled", () => {
    it("should return true when ADE is installed", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADEInstalled();
      expect(result).toBe(true);
    });

    it("should return false when ADE is not installed", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(1), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADEInstalled();
      expect(result).toBe(false);
    });
  });

  describe("checkADTInstalled", () => {
    it("should return true when ADT is installed", async () => {
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              // Mock pip list output with ansible-dev-tools
              callback(
                JSON.stringify([
                  { name: "ansible-dev-tools", version: "1.0.0" },
                  { name: "other-package", version: "2.0.0" },
                ]),
              );
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADTInstalled();
      expect(result).toBe(true);
    });

    it("should return false when ADT is not installed", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(1), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADTInstalled();
      expect(result).toBe(false);
    });

    it("should handle JSON parse errors", async () => {
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("invalid json"), 5);
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADTInstalled();
      expect(result).toBe(false);
    });

    it("should return false when pip list succeeds but ADT not in packages", async () => {
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(
                () =>
                  callback(
                    JSON.stringify([
                      { name: "other-package", version: "1.0.0" },
                    ]),
                  ),
                5,
              );
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADTInstalled();
      expect(result).toBe(false);
    });

    it("should pass workspaceRoot to executeCommand", async () => {
      const workspaceRoot = "/path/to/ansible-workspace";
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              callback(
                JSON.stringify([
                  { name: "ansible-dev-tools", version: "1.0.0" },
                ]),
              );
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      await checkADTInstalled(workspaceRoot);

      // Verify workspaceRoot is passed as cwd to executeCommand
      expect(spawn).toHaveBeenCalledWith(
        "pip",
        ["list", "--format=json"],
        expect.objectContaining({
          cwd: workspaceRoot,
        }),
      );
    });
  });

  describe("getEnvironmentInfo", () => {
    it("should return comprehensive environment information", async () => {
      // Mock different spawn calls for different commands
      vi.mocked(spawn).mockImplementation((command) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
        };

        // Mock different outputs for different commands
        if (command === "python3") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Python 3.11.0"), 5);
            }
          });
        } else if (command === "ansible") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("ansible [core 2.15.0]"), 5);
            }
          });
        } else if (command === "ansible-lint") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("ansible-lint 6.22.0"), 5);
            }
          });
        } else if (command === "ansible-galaxy") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("ansible.posix\ncommunity.general"), 5);
            }
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mockChild as any;
      });

      const result = await getEnvironmentInfo("/test/workspace");

      expect(result.workspacePath).toBe("/test/workspace");
      expect(result.pythonVersion).toBe("Python 3.11.0");
      expect(result.ansibleVersion).toBe("ansible [core 2.15.0]");
      expect(result.ansibleLintVersion).toBe("ansible-lint 6.22.0");
      expect(result.installedCollections).toContain("ansible.posix");
      expect(result.installedCollections).toContain("community.general");
    });

    it("should detect virtual environment when VIRTUAL_ENV is set", async () => {
      const originalEnv = process.env.VIRTUAL_ENV;
      process.env.VIRTUAL_ENV = "/test/venv";

      vi.mocked(spawn).mockImplementation(
        () =>
          ({
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(0), 10);
              }
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      const result = await getEnvironmentInfo("/test/workspace");
      expect(result.virtualEnv).toBe("/test/venv");

      if (originalEnv) {
        process.env.VIRTUAL_ENV = originalEnv;
      } else {
        delete process.env.VIRTUAL_ENV;
      }
    });

    it("should handle missing Python version gracefully", async () => {
      vi.mocked(spawn).mockImplementation(
        (command) =>
          ({
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(command === "python3" ? 1 : 0), 10);
              }
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      const result = await getEnvironmentInfo("/test/workspace");
      expect(result.pythonVersion).toBe("Unknown");
    });
  });

  describe("setupDevelopmentEnvironment", () => {
    it("should setup environment successfully when ADT is available", async () => {
      // Mock ADT check to return true
      vi.mocked(spawn).mockImplementation((command) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
        };

        if (command === "ansible-dev-tools") {
          // ADT is available

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return mockChild as any;
        }

        if (command === "python3") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(
                () => callback("Virtual environment created successfully"),
                5,
              );
            }
          });
        }

        if (command === "ansible-galaxy") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(
                () => callback("Collection installed successfully"),
                5,
              );
            }
          });
        }

        if (command === "pip") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(
                () => callback("Requirements installed successfully"),
                5,
              );
            }
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mockChild as any;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        envName: "test-env",
        pythonVersion: "3.11",
        collections: ["ansible.posix"],
        installRequirements: false,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Virtual environment created at");
    });

    it("should install ADT and setup environment when ADT is not available", async () => {
      // Mock ADT check to return false, then pip install to succeed
      vi.mocked(spawn).mockImplementation((command) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
        };

        if (command === "ansible-dev-tools") {
          return {
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(1), 10);
              }
            }),

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }

        if (command === "python3") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(
                () => callback("Virtual environment created successfully"),
                5,
              );
            }
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mockChild as any;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");
      expect(result.success).toBe(true);
      expect(result.output).toContain("Virtual environment created at");
    });

    it("should handle venv creation failure", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // Fail if it's python3 creating venv
              setTimeout(
                () =>
                  callback(
                    command === "python3" && args?.includes("venv") ? 1 : 0,
                  ),
                10,
              );
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");
      expect(result.success).toBe(false);
    });

    it("should install collections when provided", async () => {
      vi.mocked(spawn).mockImplementation((command) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        if (command === "ansible-galaxy") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Collection installed"), 5);
            }
          });
        }

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        collections: ["ansible.posix"],
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Collections installed successfully");
    });

    it("should handle requirements installation failure", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // Requirements install fails, all others succeed
              if (
                command === "pip" &&
                args?.includes("install") &&
                args?.includes("-r")
              ) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        if (command === "pip" && args?.includes("list")) {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback(JSON.stringify([])), 5);
            }
          });
        }

        return mockChild;
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        installRequirements: true,
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to install requirements");
    });

    it("should handle final verification failure", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // Final verification fails (ansible-lint in venv)
              if (
                command === "bash" &&
                args?.[1]?.includes("ansible-lint") &&
                args?.[1]?.includes("--version")
              ) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        if (command === "pip") {
          if (args?.includes("list")) {
            mockChild.stdout.on = vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback(JSON.stringify([])), 5);
              }
            });
          }
        }

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");
      expect(result.success).toBe(false);
      expect(result.output).toContain("Final verification failed");
    });

    it("should handle ansible tools installation failure in venv", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // Ansible tools install in venv fails
              if (
                command === "bash" &&
                args?.[1]?.includes("pip") &&
                args?.[1]?.includes("ansible-lint")
              ) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        if (command === "pip") {
          if (args?.includes("list")) {
            mockChild.stdout.on = vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback(JSON.stringify([])), 5);
              }
            });
          }
        }

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");
      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to install Ansible tools");
    });

    it("should handle collections installation failure", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              if (command === "bash" && args?.[1]?.includes("ansible-galaxy")) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        if (command === "pip") {
          if (args?.includes("list")) {
            mockChild.stdout.on = vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback(JSON.stringify([])), 5);
              }
            });
          }
        }

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        collections: ["ansible.posix"],
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to install collections");
    });

    it("should handle ADT installation failure", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: {
            on: vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback("error"), 5);
              }
            }),
          },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // ADT check fails (pip list), pip install fails, pipx fails
              if (command === "pip" && args?.includes("list")) {
                setTimeout(() => callback(1), 10);
              } else if (command === "pip" && args?.includes("install")) {
                setTimeout(() => callback(1), 10);
              } else if (command === "pipx") {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to install ADT");
    });

    it("should check Python version availability before creating venv", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        if (command === "python3.11" && args?.includes("--version")) {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Python 3.11.0"), 5);
            }
          });
        }

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        pythonVersion: "3.11",
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Python 3.11 is available");
    });

    it("should fail when requested Python version is not available", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // Python version check fails
              if (command === "python3.11" && args?.includes("--version")) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        pythonVersion: "3.11",
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Python 3.11 is not available");
      expect(result.output).toContain("Requirements:");
      expect(result.error).toContain("Python 3.11 is not available");
    });

    it("should provide detailed error when venv creation fails", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: {
            on: vi.fn((event, callback) => {
              if (
                event === "data" &&
                command === "python3" &&
                args?.includes("venv")
              ) {
                setTimeout(() => callback("Error: No module named venv"), 5);
              }
            }),
          },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // venv creation fails
              if (command === "python3" && args?.includes("venv")) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");

      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to create virtual environment");
      expect(result.output).toContain("Requirements:");
    });

    it("should include setup parameters in output header", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        pythonVersion: "3.12",
        collections: ["amazon.aws", "ansible.posix"],
      });

      expect(result.output).toContain("Workspace: /test/workspace");
      expect(result.output).toContain("Python version: 3.12");
      expect(result.output).toContain("Collections: amazon.aws, ansible.posix");
    });
  });

  describe("checkAndInstallADT", () => {
    it("should return success when ADT is already installed", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        if (command === "pip" && args?.includes("list")) {
          return {
            stdout: {
              on: vi.fn((event, callback) => {
                if (event === "data") {
                  // Mock pip list output with ansible-dev-tools
                  callback(
                    JSON.stringify([
                      { name: "ansible-dev-tools", version: "1.0.0" },
                      { name: "other-package", version: "2.0.0" },
                    ]),
                  );
                }
              }),
            },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(0), 10);
              }
            }),

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(1), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      });

      const result = await checkAndInstallADT();
      expect(result.success).toBe(true);
      expect(result.output).toContain(
        "ADT (ansible-dev-tools) is already installed",
      );
    });

    it("should install ADT when not available", async () => {
      vi.mocked(spawn).mockImplementation((command) => {
        if (command === "ansible-dev-tools") {
          return {
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(1), 10);
              }
            }),

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        } else if (command === "pip") {
          return {
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(0), 10);
              }
            }),

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(1), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      });

      const result = await checkAndInstallADT();
      expect(result.success).toBe(true);
      expect(result.output).toContain(
        "ADT (ansible-dev-tools) installed successfully",
      );
    });

    it("should try pipx when pip fails", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // pip list fails (ADT not installed)
              if (command === "pip" && args?.includes("list")) {
                setTimeout(() => callback(1), 10);
              } else if (command === "pip" && args?.includes("install")) {
                // pip install fails
                setTimeout(() => callback(1), 10);
              } else if (command === "pipx") {
                // pipx succeeds
                setTimeout(() => callback(0), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await checkAndInstallADT();
      expect(result.success).toBe(true);
      expect(result.output).toContain("installed successfully via pipx");
    });

    it("should return error when both pip and pipx fail", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: {
            on: vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback(`${command} error`), 5);
              }
            }),
          },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              if (command === "pip" && args?.includes("list")) {
                setTimeout(() => callback(1), 10);
              } else {
                // Both pip and pipx fail
                setTimeout(() => callback(1), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      const result = await checkAndInstallADT();
      expect(result.success).toBe(false);
      expect(result.error).toContain("pip error");
      expect(result.error).toContain("pipx error");
    });

    it("should pass workspaceRoot to executeCommand", async () => {
      const workspaceRoot = "/path/to/ansible-workspace";
      const calls: Array<{ command: string; args: string[]; cwd?: string }> =
        [];
      vi.mocked(spawn).mockImplementation((command, args, options) => {
        // Track all spawn calls to verify workspaceRoot is passed
        calls.push({
          command: command,
          args: args as string[],
          cwd: (options as { cwd?: string })?.cwd,
        });

        const mockChild = {
          stdout: {
            on: vi.fn((event, callback) => {
              if (event === "data") {
                if (command === "pip" && args?.includes("list")) {
                  // ADT not installed
                  callback(JSON.stringify([{ name: "other-package" }]));
                }
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              if (command === "pip" && args?.includes("list")) {
                setTimeout(() => callback(0), 10);
              } else if (command === "pip" && args?.includes("install")) {
                setTimeout(() => callback(0), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        return mockChild;
      });

      await checkAndInstallADT(workspaceRoot);

      // Verify workspaceRoot is passed as cwd to all executeCommand calls
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((call) => {
        expect(call.cwd).toBe(workspaceRoot);
      });
    });
  });

  describe("createVirtualEnvironment", () => {
    it("should create virtual environment with default name", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await createVirtualEnvironment("/test/workspace");
      expect(result.success).toBe(true);
      expect(result.venvPath).toContain("venv");
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "python3",
        ["-m", "venv", expect.stringContaining("venv")],
        expect.objectContaining({ cwd: "/test/workspace" }),
      );
    });

    it("should create virtual environment with custom name", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await createVirtualEnvironment(
        "/test/workspace",
        "custom-env",
      );
      expect(result.success).toBe(true);
      expect(result.venvPath).toContain("custom-env");
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "python3",
        ["-m", "venv", expect.stringContaining("custom-env")],
        expect.anything(),
      );
    });

    it("should use custom Python version when provided", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await createVirtualEnvironment(
        "/test/workspace",
        undefined,
        "3.11",
      );
      expect(result.success).toBe(true);
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "python3.11",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("executeInVirtualEnvironment", () => {
    it("should execute command in virtual environment", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await executeInVirtualEnvironment("/test/venv", "pip", [
        "install",
        "package",
      ]);
      expect(result.success).toBe(true);
      const calls = vi.mocked(spawn).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const bashCall = calls.find((call) => call[0] === "bash");
      expect(bashCall).toBeDefined();
      expect(bashCall?.[1][1]).toContain("source /test/venv/bin/activate");
    });
  });

  describe("installCollections", () => {
    it("should install collections using ansible-galaxy", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await installCollections("/test/workspace", [
        "ansible.posix",
        "community.general",
      ]);
      expect(result.success).toBe(true);
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "ansible-galaxy",
        ["collection", "install", "ansible.posix", "community.general"],
        expect.objectContaining({ cwd: "/test/workspace" }),
      );
    });
  });

  describe("installRequirements", () => {
    it("should install requirements from specified file", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await installRequirements(
        "/test/workspace",
        "custom-requirements.txt",
      );
      expect(result.success).toBe(true);
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        "pip",
        ["install", "-r", "custom-requirements.txt"],
        expect.objectContaining({ cwd: "/test/workspace" }),
      );
    });

    it("should return error when no requirements file found", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("Not found"));

      const result = await installRequirements("/test/workspace");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No requirements file found");
    });
  });

  describe("checkConflictingPackages", () => {
    it("should report no conflicts when none detected", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: {
            on: vi.fn((event, callback) => {
              if (
                event === "data" &&
                command === "pip" &&
                args?.includes("list")
              ) {
                setTimeout(
                  () =>
                    callback(
                      JSON.stringify([
                        { name: "ansible-core", version: "2.15.0" },
                      ]),
                    ),
                  5,
                );
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkConflictingPackages();
      expect(result.success).toBe(true);
      expect(result.output).toContain("No conflicting packages detected");
    });

    it("should detect conflicting ansible 2.x package and suggest solutions", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: {
            on: vi.fn((event, callback) => {
              if (
                event === "data" &&
                command === "pip" &&
                args?.includes("list")
              ) {
                setTimeout(
                  () =>
                    callback(
                      JSON.stringify([{ name: "ansible", version: "2.9.27" }]),
                    ),
                  5,
                );
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkConflictingPackages();
      expect(result.success).toBe(false); // Should fail when conflict detected
      expect(result.output).toContain("Found conflicting ansible package");
      expect(result.output).toContain("Option 1 (pip):");
      expect(result.output).toContain("pip uninstall ansible");
      expect(result.output).not.toContain("Removed"); // Should not remove anything
    });

    it("should handle pip list failure gracefully", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: {
            on: vi.fn((event, callback) => {
              if (
                event === "data" &&
                command === "pip" &&
                args?.includes("list")
              ) {
                setTimeout(
                  () =>
                    callback(
                      JSON.stringify([{ name: "ansible", version: "2.9.27" }]),
                    ),
                  5,
                );
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // pip list fails
              if (command === "pip" && args?.includes("list")) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkConflictingPackages();
      expect(result.success).toBe(true);
      expect(result.output).toContain(
        "Could not check for conflicting packages",
      );
    });

    it("should handle JSON parse errors", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: {
            on: vi.fn((event, callback) => {
              if (
                event === "data" &&
                command === "pip" &&
                args?.includes("list")
              ) {
                setTimeout(() => callback("invalid json"), 5);
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0), 10);
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkConflictingPackages();
      expect(result.success).toBe(true);
      expect(result.output).toContain("Could not parse pip list output");
      expect(result.output).toContain(
        "Unable to check for conflicting packages",
      );
    });

    it("should handle pip list failure", async () => {
      vi.mocked(spawn).mockImplementation((command, args) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              if (command === "pip" && args?.includes("list")) {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkConflictingPackages();
      expect(result.success).toBe(true);
      expect(result.output).toContain(
        "Could not check for conflicting packages",
      );
    });
  });

  describe("checkAnsibleLint", () => {
    it("should return success when ansible-lint is working", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await checkAnsibleLint();
      expect(result.success).toBe(true);
      expect(result.output).toContain("ansible-lint is working properly");
      expect(result.output).toContain("Version:");
    });

    it("should diagnose ansible-lint issues and suggest solutions", async () => {
      vi.mocked(spawn).mockImplementation((command) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: {
            on: vi.fn((event, callback) => {
              if (event === "data" && command === "ansible-lint") {
                setTimeout(() => callback("command not found"), 5);
              }
            }),
          },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // ansible-lint fails, ansible check succeeds
              if (command === "ansible-lint") {
                setTimeout(() => callback(1), 10);
              } else if (command === "ansible") {
                setTimeout(() => callback(0), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkAnsibleLint();
      expect(result.success).toBe(false);
      expect(result.output).toContain("ansible-lint is not working properly");
      expect(result.output).toContain("Possible causes and solutions:");
      expect(result.output).toContain("pip install ansible-lint");
    });

    it("should diagnose when ansible-core is also missing", async () => {
      vi.mocked(spawn).mockImplementation((command) => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: {
            on: vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback("command not found"), 5);
              }
            }),
          },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              // Both ansible-lint and ansible fail
              if (command === "ansible-lint" || command === "ansible") {
                setTimeout(() => callback(1), 10);
              } else {
                setTimeout(() => callback(0), 10);
              }
            }
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        return mockChild;
      });

      const result = await checkAnsibleLint();
      expect(result.success).toBe(false);
      expect(result.output).toContain("ansible-lint is not working properly");
      expect(result.output).toContain(
        "ansible-core also appears to be missing",
      );
      expect(result.output).toContain("pip install ansible-core");
    });
  });

  describe("formatEnvironmentInfo", () => {
    it("should format environment information correctly", () => {
      const envInfo: ADEEnvironmentInfo = {
        virtualEnv: "/test/venv",
        pythonVersion: "Python 3.11.0",
        ansibleVersion: "ansible [core 2.15.0]",
        ansibleLintVersion: "ansible-lint 6.22.0",
        installedCollections: ["ansible.posix", "community.general"],
        workspacePath: "/test/workspace",
        adeInstalled: true,
        adtInstalled: true,
      };

      const formatted = formatEnvironmentInfo(envInfo);

      expect(formatted).toContain("Environment Information");
      expect(formatted).toContain("Workspace: /test/workspace");
      expect(formatted).toContain("Python: Python 3.11.0");
      expect(formatted).toContain("Virtual Environment: /test/venv");
      expect(formatted).toContain("- Ansible: ansible [core 2.15.0]");
      expect(formatted).toContain("- Ansible Lint: ansible-lint 6.22.0");
      expect(formatted).toContain("- ADE: Installed");
      expect(formatted).toContain("- ADT: Installed");
      expect(formatted).toContain("- ansible.posix");
      expect(formatted).toContain("- community.general");
    });

    it("should handle missing information gracefully", () => {
      const envInfo: ADEEnvironmentInfo = {
        virtualEnv: null,
        pythonVersion: "Unknown",
        ansibleVersion: null,
        ansibleLintVersion: null,
        installedCollections: [],
        workspacePath: "/test/workspace",
        adeInstalled: false,
        adtInstalled: false,
      };

      const formatted = formatEnvironmentInfo(envInfo);

      expect(formatted).toContain("Virtual Environment: Not set");
      expect(formatted).toContain("- Ansible: Not installed");
      expect(formatted).toContain("- Ansible Lint: Not installed");
      expect(formatted).toContain("- ADE: Not installed");
      expect(formatted).toContain("- ADT: Not installed");
      expect(formatted).toContain("- None");
    });
  });
});
