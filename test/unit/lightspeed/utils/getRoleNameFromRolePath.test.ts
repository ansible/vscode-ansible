import { expect } from "chai";
import * as path from "path";
import { getRoleNameFromFilePath } from "../../../../src/features/lightspeed/utils/getRoleNameFromFilePath";

describe("getRoleNameFromFilePath", function () {
  it("should return the role name when the path contains 'roles'", function () {
    const testPath = path.join(
      "some",
      "path",
      "roles",
      "my_role",
      "tasks",
      "main.yml",
    );
    const roleName = getRoleNameFromFilePath(testPath);
    expect(roleName).to.equal("my_role");
  });

  it("should return an empty string when the path does not contain 'roles'", function () {
    const testPath = path.join("some", "path", "my_role", "tasks", "main.yml");
    const roleName = getRoleNameFromFilePath(testPath);
    expect(roleName).to.equal("");
  });

  it("should return an empty string when 'roles' is the last part of the path", function () {
    const testPath = path.join("some", "path", "roles");
    const roleName = getRoleNameFromFilePath(testPath);
    expect(roleName).to.equal("");
  });

  it("should handle paths with multiple 'roles' segments correctly", function () {
    const testPath = path.join(
      "some",
      "roles",
      "path",
      "roles",
      "my_role",
      "tasks",
      "main.yml",
    );
    const roleName = getRoleNameFromFilePath(testPath);
    expect(roleName).to.equal("my_role");
  });
});
