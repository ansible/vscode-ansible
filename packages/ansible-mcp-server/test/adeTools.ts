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
  type ADEEnvironmentInfo,
} from "../src/tools/adeTools.js";

describe("ADE Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeCommand", () => {
    it("should execute a command successfully", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await executeCommand("python", ["--version"]);
      expect(result.success).toBe(true);
    });

    it("should handle command errors", async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(1), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await executeCommand("invalid-command");
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
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
              callback(JSON.stringify([
                { name: "ansible-dev-tools", version: "1.0.0" },
                { name: "other-package", version: "2.0.0" }
              ]));
            }
          })
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

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

      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await checkADTInstalled();
      expect(result).toBe(false);
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
          return mockChild as any;
        }

        if (command === "python3") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Virtual environment created successfully"), 5);
            }
          });
        }

        if (command === "ansible-galaxy") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Collection installed successfully"), 5);
            }
          });
        }

        if (command === "pip") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Requirements installed successfully"), 5);
            }
          });
        }

        return mockChild as any;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace", {
        envName: "test-env",
        pythonVersion: "3.11",
        collections: ["ansible.posix"],
        installRequirements: false,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Virtual environment created successfully");
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
          } as any;
        }

        if (command === "python3") {
          mockChild.stdout.on = vi.fn((event, callback) => {
            if (event === "data") {
              setTimeout(() => callback("Virtual environment created successfully"), 5);
            }
          });
        }

        return mockChild as any;
      });

      const result = await setupDevelopmentEnvironment("/test/workspace");
      expect(result.success).toBe(true);
      expect(result.output).toContain("Virtual environment created successfully");
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
                  callback(JSON.stringify([
                    { name: "ansible-dev-tools", version: "1.0.0" },
                    { name: "other-package", version: "2.0.0" }
                  ]));
                }
              })
            },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
              if (event === "close") {
                setTimeout(() => callback(0), 10);
              }
            }),
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
        } as any;
      });

      const result = await checkAndInstallADT();
      expect(result.success).toBe(true);
      expect(result.output).toContain("ADT (ansible-dev-tools) is already installed");
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
        } as any;
      });

      const result = await checkAndInstallADT();
      expect(result.success).toBe(true);
      expect(result.output).toContain("ADT (ansible-dev-tools) installed successfully");
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
      
      expect(formatted).toContain("🔍 Environment Information");
      expect(formatted).toContain("📁 Workspace: /test/workspace");
      expect(formatted).toContain("🐍 Python: Python 3.11.0");
      expect(formatted).toContain("🔧 Virtual Environment: /test/venv");
      expect(formatted).toContain("• Ansible: ansible [core 2.15.0]");
      expect(formatted).toContain("• Ansible Lint: ansible-lint 6.22.0");
      expect(formatted).toContain("• ADE: ✅ Installed");
      expect(formatted).toContain("• ADT: ✅ Installed");
      expect(formatted).toContain("• ansible.posix");
      expect(formatted).toContain("• community.general");
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
      
      expect(formatted).toContain("🔧 Virtual Environment: Not set");
      expect(formatted).toContain("• Ansible: Not installed");
      expect(formatted).toContain("• Ansible Lint: Not installed");
      expect(formatted).toContain("• ADE: ❌ Not installed");
      expect(formatted).toContain("• ADT: ❌ Not installed");
      expect(formatted).toContain("• None");
    });
  });
});