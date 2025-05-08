require("assert");

import { updateRolesContext } from "../../../../src/features/lightspeed/utils/updateRolesContext";
import assert from "assert";
import sinon from "sinon";
import tmp from "tmp";
import fs from "fs";

import { IWorkSpaceRolesContext } from "../../../../src/interfaces/lightspeed";

describe("testing updateRolesContext", () => {
  const tmpDir = tmp.dirSync();
  after(function () {
    fs.rmSync(tmpDir.name, { recursive: true, force: true });
  });

  it("with no root directory", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};
    const result = updateRolesContext(ansibleRolesCache, "", "workSpace");

    assert.strictEqual(result, undefined);
    assert.equal(Object.keys(ansibleRolesCache).length, 0);
  });

  it("with an empty roles directory", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/empty`;
    fs.mkdirSync(`${root_dir}/roles`, { recursive: true });

    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");

    assert.equal(Object.keys(ansibleRolesCache).length, 0);
  });

  it("with a file called 'roles'", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/role_as_file`;
    fs.mkdirSync(root_dir, { recursive: true });
    fs.writeFileSync(`${root_dir}/roles`, "");

    const spiedConsole = sinon.spy(console, "error");
    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");
    const console_log_calls = spiedConsole.getCalls();
    spiedConsole.restore();

    assert.ok(
      console_log_calls.find((item) =>
        String(item.firstArg).includes("Cannot read the directory"),
      ),
    );

    assert.equal(Object.keys(ansibleRolesCache).length, 0);
  });

  it("with a role with just one task'", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/role_with_one_task`;
    fs.mkdirSync(`${root_dir}/roles/my_role/tasks`, { recursive: true });
    fs.writeFileSync(
      `${root_dir}/roles/my_role/tasks/main.yaml`,
      "---\n- debug:\n  var=1\n",
    );

    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");
    const cacheEntry =
      ansibleRolesCache["my_workSpace"][`${root_dir}/roles/my_role`];
    const tasks = cacheEntry["tasks"];
    if (!cacheEntry["roleVars"]) {
      assert.fail("roleVars is not defined.");
    }
    const defaults = cacheEntry["roleVars"].defaults;
    const vars = cacheEntry["roleVars"].vars;
    assert.equal(tasks && tasks[0], "main");
    assert.equal(Object.keys(defaults).length, 0);
    assert.equal(Object.keys(vars).length, 0);
  });

  it("with a role where 'tasks' is a file, not a directory", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/role_with_a_file_called_tasks`;
    fs.mkdirSync(`${root_dir}/roles/my_role`, { recursive: true });
    fs.writeFileSync(
      `${root_dir}/roles/my_role/tasks`,
      "nothing in particular",
    );

    const spiedConsole = sinon.spy(console, "error");
    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");
    const console_log_calls = spiedConsole.getCalls();
    spiedConsole.restore();

    assert.ok(
      console_log_calls.find((item) =>
        String(item.firstArg).includes(
          'Failed to read "tasks" directory with error',
        ),
      ),
    );
  });

  it("with a role with one task and a vars file'", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/role_with_task_and_var_file`;
    fs.mkdirSync(`${root_dir}/roles/my_role/tasks`, { recursive: true });
    fs.mkdirSync(`${root_dir}/roles/my_role/vars`, { recursive: true });
    fs.writeFileSync(
      `${root_dir}/roles/my_role/tasks/main.yaml`,
      "---\n- debug:\n  var=1\n",
    );
    fs.writeFileSync(
      `${root_dir}/roles/my_role/vars/main.yaml`,
      "---\nsome_var: 1\n",
    );

    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");

    const cacheEntry =
      ansibleRolesCache["my_workSpace"][`${root_dir}/roles/my_role`];
    const tasks = cacheEntry["tasks"];
    if (!cacheEntry["roleVars"]) {
      assert.fail("roleVars is not defined.");
    }
    const defaults = cacheEntry["roleVars"].defaults;
    const vars = cacheEntry["roleVars"].vars;
    assert.equal(tasks && tasks[0], "main");
    assert.equal(Object.keys(defaults).length, 0);
    assert.equal(Object.keys(vars).length, 1);
    assert.equal(vars["main.yaml"], "some_var: 1\n");
  });

  it("with a role where 'vars' is a file, not a directory", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/role_where_vars_is_a_file`;
    fs.mkdirSync(`${root_dir}/roles/my_role`, { recursive: true });
    fs.writeFileSync(`${root_dir}/roles/my_role/vars`, "some content");
    fs.writeFileSync(`${root_dir}/roles/my_role/defaults`, "some content");

    const spiedConsole = sinon.spy(console, "error");
    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");
    const console_log_calls = spiedConsole.getCalls();
    spiedConsole.restore();

    assert.ok(
      console_log_calls.find((item) =>
        String(item.firstArg).includes(
          "Failed to read a var directory with error",
        ),
      ),
    );
  });
  it("with a role where 'defaults' is a file, not a directory, but 'vars' is a directory as expected", () => {
    const ansibleRolesCache: IWorkSpaceRolesContext = {};

    const root_dir = `${tmpDir.name}/role_where_defaults_is_a_file_and_vars_is_a_directory`;
    fs.mkdirSync(`${root_dir}/roles/my_role/vars`, { recursive: true });
    fs.writeFileSync(`${root_dir}/roles/my_role/defaults`, "some content");
    fs.writeFileSync(
      `${root_dir}/roles/my_role/vars/main.yaml`,
      '---\nsome_var: ""\n',
    );

    const spiedConsole = sinon.spy(console, "error");
    updateRolesContext(ansibleRolesCache, `${root_dir}/roles`, "my_workSpace");
    const console_log_calls = spiedConsole.getCalls();
    spiedConsole.restore();

    assert.ok(
      console_log_calls.find((item) =>
        String(item.firstArg).includes(
          "Failed to read a var directory with error",
        ),
      ),
    );

    const cacheEntry =
      ansibleRolesCache["my_workSpace"][`${root_dir}/roles/my_role`];
    const tasks = cacheEntry["tasks"];
    if (tasks) {
      // NOTE: currently, tasks is undefined in this context, but having it
      // set to {} in
      // the future is also reasonable.
      assert.equal(Object.keys(tasks).length, 0);
    }
    if (!cacheEntry["roleVars"]) {
      assert.fail("roleVars is not defined.");
    }

    const defaults = cacheEntry["roleVars"].defaults;
    // vars is properly set despite the invalid 'defaults' file.
    const vars = cacheEntry["roleVars"].vars;
    assert.equal(Object.keys(defaults).length, 0);
    assert.equal(Object.keys(vars).length, 1);
    assert.equal(vars["main.yaml"], 'some_var: ""\n');
  });
});
