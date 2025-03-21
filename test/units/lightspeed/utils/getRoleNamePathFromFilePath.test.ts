import { expect } from "chai";
import * as path from "path";
import { getRoleNamePathFromFilePath } from "../../../../src/features/lightspeed/utils/getRoleNamePathFromFilePath";

describe("getRoleNamePathFromFilePath", () => {
  it("should return the correct role name path when the file path contains 'roles'", () => {
    const testPath = path.join(
      "vscode-ansible",
      "roles",
      "myRole",
      "tasks",
      "main.yml",
    );
    const result = getRoleNamePathFromFilePath(testPath);
    expect(result).to.equal(path.join("vscode-ansible", "roles", "myRole"));
  });

  it("should return an empty string when the file path does not contain 'roles'", () => {
    const testPath = path.join("vscode-ansible", "playbooks", "main.yml");
    const result = getRoleNamePathFromFilePath(testPath);
    expect(result).to.equal("");
  });

  it("should return the correct role name path when the file path contains multiple 'roles'", () => {
    const testPath = path.join(
      "Users",
      "ansible",
      "Desktop",
      "vscode-ansible",
      "roles",
      "role1",
      "roles",
      "role2",
      "tasks",
      "main.yml",
    );
    const result = getRoleNamePathFromFilePath(testPath);
    expect(result).to.equal(
      path.join(
        "Users",
        "ansible",
        "Desktop",
        "vscode-ansible",
        "roles",
        "role1",
        "roles",
        "role2",
      ),
    );
  });
});
