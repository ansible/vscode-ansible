import * as path from "path";
import { expect, describe, it } from "vitest";
import { URI } from "vscode-uri";
import { resolveDocUri } from "@test/helper.js";
import {
  getRoleContextFromUri,
  getRoleVariables,
  getRoleEntryPointDescription,
  resolveModuleFilePath,
  resolveRolePath,
  listRoleYamlFiles,
} from "@src/utils/roleResolver.js";

describe("resolveRolePath()", () => {
  it("should resolve role relative to document", () => {
    const docUri = resolveDocUri("references/playbook_includes.yml");
    const result = resolveRolePath("test_role", docUri);
    expect(result).not.toBeNull();
    expect(result).toContain("roles/test_role");
  });

  it("should return null for non-existent role", () => {
    const docUri = resolveDocUri("references/playbook_includes.yml");
    const result = resolveRolePath("nonexistent_role_xyz", docUri);
    expect(result).toBeNull();
  });

  it("should search in provided rolesPaths", () => {
    const docUri = resolveDocUri("references/playbook_includes.yml");
    const customPaths = [resolveDocUri("references/roles")];
    const result = resolveRolePath("test_role", docUri, customPaths);
    expect(result).not.toBeNull();
  });
});

describe("getRoleContextFromUri()", () => {
  it("should detect role context from task file", () => {
    const uri = resolveDocUri("references/roles/test_role/tasks/main.yml");
    const result = getRoleContextFromUri(uri);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
    expect(result?.rolePath).toContain("roles/test_role");
  });

  it("should detect role context from handler file", () => {
    const uri = resolveDocUri("references/roles/test_role/handlers/main.yml");
    const result = getRoleContextFromUri(uri);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
  });

  it("should return null for non-role files", () => {
    const uri = resolveDocUri("references/playbook_handlers.yml");
    const result = getRoleContextFromUri(uri);
    expect(result).toBeNull();
  });
});

describe("getRoleVariables()", () => {
  const rolePath = resolveDocUri("references/roles/test_role");

  describe("external context (playbook)", () => {
    it("should return argument_specs variables with IOption info", () => {
      const vars = getRoleVariables(rolePath, true, "main");
      expect(vars.length).toBeGreaterThanOrEqual(3);

      const appPort = vars.find((v) => v.name === "app_port");
      expect(appPort).toBeDefined();
      expect(appPort?.option).toBeDefined();
      expect(appPort?.option?.type).toBe("int");
      expect(appPort?.option?.default).toBe(8080);
    });

    it("should include defaults not in argument_specs as fallback", () => {
      const vars = getRoleVariables(rolePath, true, "main");
      const appDebug = vars.find((v) => v.name === "app_debug");
      expect(appDebug).toBeDefined();
      expect(appDebug?.option).toBeUndefined();
    });
  });

  describe("internal context (inside role)", () => {
    it("should return defaults + vars combined", () => {
      const vars = getRoleVariables(rolePath, false);
      const names = vars.map((v) => v.name);

      // From defaults
      expect(names).toContain("app_port");
      expect(names).toContain("app_debug");
      // From vars
      expect(names).toContain("app_internal_secret");
    });

    it("should enrich with argument_specs docs when available", () => {
      const vars = getRoleVariables(rolePath, false);
      const appPort = vars.find((v) => v.name === "app_port");
      expect(appPort?.option).toBeDefined();
      expect(appPort?.option?.type).toBe("int");
    });
  });
});

describe("getRoleEntryPointDescription()", () => {
  const rolePath = resolveDocUri("references/roles/test_role");

  it("should return short_description for main entry point", () => {
    const desc = getRoleEntryPointDescription(rolePath, "main");
    expect(desc).toBe("Install and configure test application");
  });

  it("should return undefined for non-existent entry point", () => {
    const desc = getRoleEntryPointDescription(rolePath, "nonexistent");
    expect(desc).toBeUndefined();
  });
});

describe("getRoleVariables() edge cases", () => {
  it("should return empty for non-existent role path", () => {
    const vars = getRoleVariables("/nonexistent/path", true);
    expect(vars).toHaveLength(0);
  });

  it("should return empty for non-existent role path (internal)", () => {
    const vars = getRoleVariables("/nonexistent/path", false);
    expect(vars).toHaveLength(0);
  });
});

describe("resolveModuleFilePath()", () => {
  it("should resolve template src within role", () => {
    const taskUri = resolveDocUri(
      "references/roles/test_role/tasks/main.yml",
    );
    const result = resolveModuleFilePath(
      "app.conf.j2",
      "ansible.builtin.template",
      taskUri,
    );
    expect(result).not.toBeNull();
    expect(result).toContain("templates/app.conf.j2");
  });

  it("should return null for non-existent file", () => {
    const taskUri = resolveDocUri(
      "references/roles/test_role/tasks/main.yml",
    );
    const result = resolveModuleFilePath(
      "nonexistent.yml",
      "ansible.builtin.include_tasks",
      taskUri,
    );
    expect(result).toBeNull();
  });

  it("should resolve copy src within role files dir", () => {
    // There is no files/ dir in test role, so this should return null
    const taskUri = resolveDocUri(
      "references/roles/test_role/tasks/main.yml",
    );
    const result = resolveModuleFilePath(
      "app.conf",
      "ansible.builtin.copy",
      taskUri,
    );
    expect(result).toBeNull();
  });

  it("should resolve include_tasks relative to document", () => {
    const taskUri = resolveDocUri(
      "references/roles/test_role/tasks/main.yml",
    );
    const result = resolveModuleFilePath(
      "sub_tasks.yml",
      "ansible.builtin.include_tasks",
      taskUri,
    );
    expect(result).not.toBeNull();
    expect(result).toContain("sub_tasks.yml");
  });
});

describe("listRoleYamlFiles()", () => {
  const rolePath = resolveDocUri("references/roles/test_role");

  it("should list YAML files in tasks directory", () => {
    const files = listRoleYamlFiles(rolePath, "tasks");
    expect(files.length).toBe(2);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).toContain("main.yml");
    expect(basenames).toContain("sub_tasks.yml");
  });

  it("should list YAML files in handlers directory", () => {
    const files = listRoleYamlFiles(rolePath, "handlers");
    expect(files.length).toBe(1);
  });

  it("should return empty array for non-existent directory", () => {
    const files = listRoleYamlFiles(rolePath, "nonexistent");
    expect(files).toHaveLength(0);
  });
});

describe("resolveModuleFilePath() additional cases", () => {
  it("should resolve script src within role files dir", () => {
    const taskUri = resolveDocUri(
      "references/roles/test_role/tasks/main.yml",
    );
    // script module uses files/ subdirectory (same as copy)
    const result = resolveModuleFilePath(
      "nonexistent.sh",
      "ansible.builtin.script",
      taskUri,
    );
    expect(result).toBeNull();
  });

  it("should resolve import_tasks within role tasks dir", () => {
    const taskUri = resolveDocUri(
      "references/roles/test_role/tasks/main.yml",
    );
    const result = resolveModuleFilePath(
      "sub_tasks.yml",
      "import_tasks",
      taskUri,
    );
    expect(result).not.toBeNull();
    expect(result).toContain("sub_tasks.yml");
  });

  it("should resolve file relative to document outside role", () => {
    const docUri = resolveDocUri("references/playbook_includes.yml");
    const result = resolveModuleFilePath(
      "included_tasks.yml",
      "ansible.builtin.include_tasks",
      docUri,
    );
    expect(result).not.toBeNull();
    expect(result).toContain("included_tasks.yml");
  });

  it("should return null for non-existent file outside role", () => {
    const docUri = resolveDocUri("references/playbook_includes.yml");
    const result = resolveModuleFilePath(
      "nonexistent_file.yml",
      "ansible.builtin.include_tasks",
      docUri,
    );
    expect(result).toBeNull();
  });
});

describe("getRoleVariables() additional cases", () => {
  const rolePath = resolveDocUri("references/roles/test_role");

  it("should return argument_specs with all option fields", () => {
    const vars = getRoleVariables(rolePath, true, "main");
    const appFeatures = vars.find((v) => v.name === "app_features");
    expect(appFeatures).toBeDefined();
    expect(appFeatures?.option?.type).toBe("list");
    expect(appFeatures?.option?.elements).toBe("str");
    expect(appFeatures?.option?.choices).toEqual([
      "logging",
      "monitoring",
      "caching",
    ]);
  });

  it("should return required option info", () => {
    const vars = getRoleVariables(rolePath, true, "main");
    const appUser = vars.find((v) => v.name === "app_user");
    expect(appUser).toBeDefined();
    expect(appUser?.option?.required).toBe(true);
  });
});

describe("resolveRolePath() additional cases", () => {
  it("should return null when rolesPaths has non-matching paths", () => {
    const docUri = resolveDocUri("references/playbook_includes.yml");
    const result = resolveRolePath("nonexistent_role", docUri, [
      "/tmp/nonexistent_roles_dir",
    ]);
    expect(result).toBeNull();
  });
});

describe("getRoleContextFromUri() validation", () => {
  it("should return null for /roles/ path without standard role structure", () => {
    const result = getRoleContextFromUri(
      "file:///fake/roles/not_a_role/somefile.yml",
    );
    expect(result).toBeNull();
  });
});

describe("getRoleContextFromUri() additional cases", () => {
  it("should detect role context from defaults file", () => {
    const uri = resolveDocUri("references/roles/test_role/defaults/main.yml");
    const result = getRoleContextFromUri(uri);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
  });

  it("should detect role context from vars file", () => {
    const uri = resolveDocUri("references/roles/test_role/vars/main.yml");
    const result = getRoleContextFromUri(uri);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
  });
});

describe("getRoleContextFromUri() with rolesPaths", () => {
  it("should detect role context via rolesPaths", () => {
    const rolesDir = resolveDocUri("references/roles");
    const fileUri = URI.file(
      path.join(rolesDir, "test_role/tasks/main.yml"),
    ).toString();
    const result = getRoleContextFromUri(fileUri, [rolesDir]);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
  });

  it("should return null when rolesPaths provided but file not in any", () => {
    const result = getRoleContextFromUri(
      "file:///tmp/some/random/file.yml",
      ["/opt/custom_roles"],
    );
    expect(result).toBeNull();
  });

  it("should fallback to /roles/ detection when rolesPaths don't match", () => {
    const uri = URI.file(
      resolveDocUri("references/roles/test_role/tasks/main.yml"),
    ).toString();
    const result = getRoleContextFromUri(uri, ["/some/other/path"]);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
  });

  it("should resolve nested vendor role via rolesPaths", () => {
    const vendorDir = resolveDocUri("references/roles/vendor");
    const fileUri = URI.file(
      path.join(vendorDir, "nested_role/tasks/main.yml"),
    ).toString();

    // Without rolesPaths — /roles/ fallback picks "vendor", but vendor/ has no tasks/ → null
    const withoutPaths = getRoleContextFromUri(fileUri);
    expect(withoutPaths).toBeNull();

    // With rolesPaths — finds nested_role
    const withPaths = getRoleContextFromUri(fileUri, [vendorDir]);
    expect(withPaths).not.toBeNull();
    expect(withPaths?.roleName).toBe("nested_role");
    expect(withPaths?.rolePath).toBe(path.join(vendorDir, "nested_role"));
  });

  it("should prefer rolesPaths over /roles/ path detection", () => {
    const rolesDir = resolveDocUri("references/roles");
    const fileUri = URI.file(
      path.join(rolesDir, "test_role/tasks/main.yml"),
    ).toString();
    const result = getRoleContextFromUri(fileUri, [rolesDir]);
    expect(result).not.toBeNull();
    expect(result?.roleName).toBe("test_role");
    expect(result?.rolePath).toBe(path.join(rolesDir, "test_role"));
  });
});
