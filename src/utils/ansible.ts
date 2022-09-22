import { MarkupContent, MarkupKind } from "vscode-languageserver";
export const playKeywords = new Map<string, string | MarkupContent>();
playKeywords.set(
  "any_errors_fatal",
  "Force any un-handled task errors on any host to propagate to all hosts and end the play.",
);

playKeywords.set(
  "become",
  "Boolean that controls if privilege escalation is used or not on Task execution. Implemented by the become plugin.",
);

playKeywords.set("become_exe", {
  kind: MarkupKind.Markdown,
  value:
    "Path to the executable used to elevate privileges. Implemented by the become plugin. See `Become Plugins`.",
});

playKeywords.set(
  "become_flags",
  "A string of flag(s) to pass to the privilege escalation program when become is True.",
);

playKeywords.set(
  "become_method",
  "Which method of privilege escalation to use (such as sudo or su).",
);

playKeywords.set(
  "become_user",
  "User that you ‘become’ after using privilege escalation. The remote/login user must have permissions to become this user.",
);

playKeywords.set("check_mode", {
  kind: MarkupKind.Markdown,
  value:
    "A boolean that controls if a task is executed in ‘check’ mode. See `Validating tasks: check mode and diff mode`.",
});

playKeywords.set("collections", {
  kind: MarkupKind.Markdown,
  value: `List of collection namespaces to search for modules, plugins, and roles. See \`Using collections in a Playbook\`.

NOTE:
Tasks within a role do not inherit the value of \`collections\` from the play. To have a role search a list of collections, use the \`collections\` keyword in \`meta/main.yml\` within a role.`,
});

playKeywords.set("connection", {
  kind: MarkupKind.Markdown,
  value:
    "Allows you to change the connection plugin used for tasks to execute on the target. See `Using connection plugins`.",
});

playKeywords.set("debugger", {
  kind: MarkupKind.Markdown,
  value:
    "Enable debugging tasks based on state of the task result. See `Debugging tasks`.",
});

playKeywords.set(
  "diff",
  "Toggle to make tasks return ‘diff’ information or not.",
);

playKeywords.set(
  "environment",
  "A dictionary that gets converted into environment vars to be provided for the task upon execution. This can ONLY be used with modules. This isn’t supported for any other type of plugins nor Ansible itself nor its configuration, it just sets the variables for the code responsible for executing the task. This is not a recommended way to pass in confidential data.",
);

playKeywords.set(
  "fact_path",
  "Set the fact path option for the fact gathering plugin controlled by gather_facts.",
);

playKeywords.set(
  "force_handlers",
  "Will force notified handler execution for hosts even if they failed during the play. Will not trigger if the play itself fails.",
);

playKeywords.set(
  "gather_facts",
  "A boolean that controls if the play will automatically run the ‘setup’ task to gather facts for the hosts.",
);

playKeywords.set(
  "gather_subset",
  "Allows you to pass subset options to the fact gathering plugin controlled by gather_facts.",
);

playKeywords.set(
  "gather_timeout",
  "Allows you to set the timeout for the fact gathering plugin controlled by gather_facts.",
);

playKeywords.set(
  "handlers",
  "A section with tasks that are treated as handlers, these won’t get executed normally, only when notified after each section of tasks is complete. A handler’s listen field cannot use templates.",
);

playKeywords.set(
  "hosts",
  "A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.",
);

playKeywords.set(
  "ignore_errors",
  "Boolean that allows you to ignore task failures and continue with play. It does not affect connection errors.",
);

playKeywords.set(
  "ignore_unreachable",
  "Boolean that allows you to ignore task failures due to an unreachable host and continue with the play. This does not affect other task errors (see ignore_errors) but is useful for groups of volatile/ephemeral hosts.",
);

playKeywords.set(
  "max_fail_percentage",
  "Can be used to abort the run after a given percentage of hosts in the current batch has failed. This only works on linear or linear derived strategies.",
);

playKeywords.set(
  "module_defaults",
  "Specifies default parameter values for modules.",
);

playKeywords.set(
  "name",
  "Identifier. Can be used for documentation, or in tasks/handlers.",
);

playKeywords.set("no_log", "Boolean that controls information disclosure.");

playKeywords.set(
  "order",
  "Controls the sorting of hosts as they are used for executing the play. Possible values are inventory (default), sorted, reverse_sorted, reverse_inventory and shuffle.",
);

playKeywords.set(
  "port",
  "Used to override the default port used in a connection.",
);

playKeywords.set(
  "post_tasks",
  "A list of tasks to execute after the tasks section.",
);

playKeywords.set("pre_tasks", "A list of tasks to execute before roles.");

playKeywords.set(
  "remote_user",
  "User used to log into the target via the connection plugin.",
);

playKeywords.set("roles", "List of roles to be imported into the play");

playKeywords.set(
  "run_once",
  "Boolean that will bypass the host loop, forcing the task to attempt to execute on the first host available and afterwards apply any results and facts to all active hosts in the same batch.",
);

playKeywords.set(
  "serial",
  "Explicitly define how Ansible batches the execution of the current play on the play’s target",
);

playKeywords.set(
  "strategy",
  "Allows you to choose the connection plugin to use for the play.",
);

playKeywords.set(
  "tags",
  "Tags applied to the task or included tasks, this allows selecting subsets of tasks from the command line.",
);

playKeywords.set(
  "tasks",
  "Main list of tasks to execute in the play, they run after roles and before post_tasks.",
);

playKeywords.set(
  "throttle",
  "Limit number of concurrent task runs on task, block and playbook level. This is independent of the forks and serial settings, but cannot be set higher than those limits. For example, if forks is set to 10 and the throttle is set to 15, at most 10 hosts will be operated on in parallel.",
);

playKeywords.set(
  "timeout",
  "Time limit for task to execute in, if exceeded Ansible will interrupt and fail the task.",
);

playKeywords.set("vars", "Dictionary/map of variables");

playKeywords.set(
  "vars_files",
  "List of files that contain vars to include in the play.",
);

playKeywords.set("vars_prompt", "List of variables to prompt for.");

export const roleKeywords = new Map<string, string | MarkupContent>();
roleKeywords.set(
  "any_errors_fatal",
  "Force any un-handled task errors on any host to propagate to all hosts and end the play.",
);

roleKeywords.set("become", {
  kind: MarkupKind.Markdown,
  value:
    "Boolean that controls if privilege escalation is used or not on Task execution. Implemented by the become plugin. See `Become Plugins`.",
});

roleKeywords.set("become_exe", {
  kind: MarkupKind.Markdown,
  value:
    "Path to the executable used to elevate privileges. Implemented by the become plugin. See `Become Plugins`.",
});

roleKeywords.set(
  "become_flags",
  "A string of flag(s) to pass to the privilege escalation program when become is True.",
);

roleKeywords.set(
  "become_method",
  "Which method of privilege escalation to use (such as sudo or su).",
);

roleKeywords.set(
  "become_user",
  "User that you ‘become’ after using privilege escalation. The remote/login user must have permissions to become this user.",
);

roleKeywords.set("check_mode", {
  kind: MarkupKind.Markdown,
  value:
    "A boolean that controls if a task is executed in ‘check’ mode. See `Validating tasks: check mode and diff mode`.",
});

roleKeywords.set("collections", {
  kind: MarkupKind.Markdown,
  value: `List of collection namespaces to search for modules, plugins, and roles. See \`Using collections in a Playbook\`.

NOTE:
Tasks within a role do not inherit the value of \`collections\` from the play. To have a role search a list of collections, use the \`collections\` keyword in \`meta/main.yml\` within a role.`,
});

roleKeywords.set("connection", {
  kind: MarkupKind.Markdown,
  value:
    "Allows you to change the connection plugin used for tasks to execute on the target. See `Using connection plugins`.",
});

roleKeywords.set("debugger", {
  kind: MarkupKind.Markdown,
  value:
    "Enable debugging tasks based on state of the task result. See `Debugging tasks`.",
});

roleKeywords.set(
  "delegate_facts",
  "Boolean that allows you to apply facts to a delegated host instead of inventory_hostname.",
);

roleKeywords.set(
  "delegate_to",
  "Host to execute task instead of the target (inventory_hostname). Connection vars from the delegated host will also be used for the task.",
);

roleKeywords.set(
  "diff",
  "Toggle to make tasks return ‘diff’ information or not.",
);

roleKeywords.set(
  "environment",
  "A dictionary that gets converted into environment vars to be provided for the task upon execution. This can ONLY be used with modules. This isn’t supported for any other type of plugins nor Ansible itself nor its configuration, it just sets the variables for the code responsible for executing the task. This is not a recommended way to pass in confidential data.",
);

roleKeywords.set(
  "ignore_errors",
  "Boolean that allows you to ignore task failures and continue with play. It does not affect connection errors.",
);

roleKeywords.set(
  "ignore_unreachable",
  "Boolean that allows you to ignore task failures due to an unreachable host and continue with the play. This does not affect other task errors (see ignore_errors) but is useful for groups of volatile/ephemeral hosts.",
);

roleKeywords.set(
  "module_defaults",
  "Specifies default parameter values for modules.",
);

roleKeywords.set(
  "name",
  "Identifier. Can be used for documentation, or in tasks/handlers.",
);

roleKeywords.set("no_log", "Boolean that controls information disclosure.");

roleKeywords.set(
  "port",
  "Used to override the default port used in a connection.",
);

roleKeywords.set(
  "remote_user",
  "User used to log into the target via the connection plugin.",
);

roleKeywords.set(
  "run_once",
  "Boolean that will bypass the host loop, forcing the task to attempt to execute on the first host available and afterwards apply any results and facts to all active hosts in the same batch.",
);

roleKeywords.set(
  "tags",
  "Tags applied to the task or included tasks, this allows selecting subsets of tasks from the command line.",
);

roleKeywords.set(
  "throttle",
  "Limit number of concurrent task runs on task, block and playbook level. This is independent of the forks and serial settings, but cannot be set higher than those limits. For example, if forks is set to 10 and the throttle is set to 15, at most 10 hosts will be operated on in parallel.",
);

roleKeywords.set(
  "timeout",
  "Time limit for task to execute in, if exceeded Ansible will interrupt and fail the task.",
);

roleKeywords.set("vars", "Dictionary/map of variables");

roleKeywords.set(
  "when",
  "Conditional expression, determines if an iteration of a task is run or not.",
);

export const blockKeywords = new Map<string, string | MarkupContent>();
blockKeywords.set(
  "always",
  "List of tasks, in a block, that execute no matter if there is an error in the block or not.",
);

blockKeywords.set(
  "any_errors_fatal",
  "Force any un-handled task errors on any host to propagate to all hosts and end the play.",
);

blockKeywords.set("become", {
  kind: MarkupKind.Markdown,
  value:
    "Boolean that controls if privilege escalation is used or not on Task execution. Implemented by the become plugin. See `Become Plugins`.",
});

blockKeywords.set("become_exe", {
  kind: MarkupKind.Markdown,
  value:
    "Path to the executable used to elevate privileges. Implemented by the become plugin. See `Become Plugins`.",
});

blockKeywords.set(
  "become_flags",
  "A string of flag(s) to pass to the privilege escalation program when become is True.",
);

blockKeywords.set(
  "become_method",
  "Which method of privilege escalation to use (such as sudo or su).",
);

blockKeywords.set(
  "become_user",
  "User that you ‘become’ after using privilege escalation. The remote/login user must have permissions to become this user.",
);

blockKeywords.set("block", "List of tasks in a block.");

blockKeywords.set("check_mode", {
  kind: MarkupKind.Markdown,
  value:
    "A boolean that controls if a task is executed in ‘check’ mode. See `Validating tasks: check mode and diff mode`.",
});

blockKeywords.set("collections", {
  kind: MarkupKind.Markdown,
  value: `List of collection namespaces to search for modules, plugins, and roles. See \`Using collections in a Playbook\`.

NOTE:
Tasks within a role do not inherit the value of \`collections\` from the play. To have a role search a list of collections, use the \`collections\` keyword in \`meta/main.yml\` within a role.`,
});

blockKeywords.set("connection", {
  kind: MarkupKind.Markdown,
  value:
    "Allows you to change the connection plugin used for tasks to execute on the target. See `Using connection plugins`.",
});

blockKeywords.set("debugger", {
  kind: MarkupKind.Markdown,
  value:
    "Enable debugging tasks based on state of the task result. See `Debugging tasks`.",
});

blockKeywords.set(
  "delegate_facts",
  "Boolean that allows you to apply facts to a delegated host instead of inventory_hostname.",
);

blockKeywords.set(
  "delegate_to",
  "Host to execute task instead of the target (inventory_hostname). Connection vars from the delegated host will also be used for the task.",
);

blockKeywords.set(
  "diff",
  "Toggle to make tasks return ‘diff’ information or not.",
);

blockKeywords.set(
  "environment",
  "A dictionary that gets converted into environment vars to be provided for the task upon execution. This can ONLY be used with modules. This isn’t supported for any other type of plugins nor Ansible itself nor its configuration, it just sets the variables for the code responsible for executing the task. This is not a recommended way to pass in confidential data.",
);

blockKeywords.set(
  "ignore_errors",
  "Boolean that allows you to ignore task failures and continue with play. It does not affect connection errors.",
);

blockKeywords.set(
  "ignore_unreachable",
  "Boolean that allows you to ignore task failures due to an unreachable host and continue with the play. This does not affect other task errors (see ignore_errors) but is useful for groups of volatile/ephemeral hosts.",
);

blockKeywords.set(
  "module_defaults",
  "Specifies default parameter values for modules.",
);

blockKeywords.set(
  "name",
  "Identifier. Can be used for documentation, or in tasks/handlers.",
);

blockKeywords.set("no_log", "Boolean that controls information disclosure.");

blockKeywords.set(
  "notify",
  "List of handlers to notify when the task returns a ‘changed=True’ status.",
);

blockKeywords.set(
  "port",
  "Used to override the default port used in a connection.",
);

blockKeywords.set(
  "remote_user",
  "User used to log into the target via the connection plugin.",
);

blockKeywords.set(
  "rescue",
  "List of tasks in a block that run if there is a task error in the main block list.",
);

blockKeywords.set(
  "run_once",
  "Boolean that will bypass the host loop, forcing the task to attempt to execute on the first host available and afterwards apply any results and facts to all active hosts in the same batch.",
);

blockKeywords.set(
  "tags",
  "Tags applied to the task or included tasks, this allows selecting subsets of tasks from the command line.",
);

blockKeywords.set(
  "throttle",
  "Limit number of concurrent task runs on task, block and playbook level. This is independent of the forks and serial settings, but cannot be set higher than those limits. For example, if forks is set to 10 and the throttle is set to 15, at most 10 hosts will be operated on in parallel.",
);

blockKeywords.set(
  "timeout",
  "Time limit for task to execute in, if exceeded Ansible will interrupt and fail the task.",
);

blockKeywords.set("vars", "Dictionary/map of variables");

blockKeywords.set(
  "when",
  "Conditional expression, determines if an iteration of a task is run or not.",
);

export const taskKeywords = new Map<string, string | MarkupContent>();
taskKeywords.set(
  "action",
  "The ‘action’ to execute for a task, it normally translates into a C(module) or action plugin.",
);

taskKeywords.set(
  "any_errors_fatal",
  "Force any un-handled task errors on any host to propagate to all hosts and end the play.",
);

taskKeywords.set(
  "args",
  "A secondary way to add arguments into a task. Takes a dictionary in which keys map to options and values.",
);

taskKeywords.set(
  "async",
  "Run a task asynchronously if the C(action) supports this; value is maximum runtime in seconds.",
);

taskKeywords.set("become", {
  kind: MarkupKind.Markdown,
  value:
    "Boolean that controls if privilege escalation is used or not on Task execution. Implemented by the become plugin. See `Become Plugins`.",
});

taskKeywords.set("become_exe", {
  kind: MarkupKind.Markdown,
  value:
    "Path to the executable used to elevate privileges. Implemented by the become plugin. See `Become Plugins`.",
});

taskKeywords.set(
  "become_flags",
  "A string of flag(s) to pass to the privilege escalation program when become is True.",
);

taskKeywords.set(
  "become_method",
  "Which method of privilege escalation to use (such as sudo or su).",
);

taskKeywords.set(
  "become_user",
  "User that you ‘become’ after using privilege escalation. The remote/login user must have permissions to become this user.",
);

taskKeywords.set(
  "changed_when",
  "Conditional expression that overrides the task’s normal ‘changed’ status.",
);

taskKeywords.set("check_mode", {
  kind: MarkupKind.Markdown,
  value:
    "A boolean that controls if a task is executed in ‘check’ mode. See `Validating tasks: check mode and diff mode`.",
});

taskKeywords.set("collections", {
  kind: MarkupKind.Markdown,
  value: `List of collection namespaces to search for modules, plugins, and roles. See \`Using collections in a Playbook\`.

NOTE:
Tasks within a role do not inherit the value of \`collections\` from the play. To have a role search a list of collections, use the \`collections\` keyword in \`meta/main.yml\` within a role.`,
});

taskKeywords.set("connection", {
  kind: MarkupKind.Markdown,
  value:
    "Allows you to change the connection plugin used for tasks to execute on the target. See `Using connection plugins`.",
});

taskKeywords.set("debugger", {
  kind: MarkupKind.Markdown,
  value:
    "Enable debugging tasks based on state of the task result. See `Debugging tasks`.",
});

taskKeywords.set(
  "delay",
  "Number of seconds to delay between retries. This setting is only used in combination with until.",
);

taskKeywords.set(
  "delegate_facts",
  "Boolean that allows you to apply facts to a delegated host instead of inventory_hostname.",
);

taskKeywords.set(
  "delegate_to",
  "Host to execute task instead of the target (inventory_hostname). Connection vars from the delegated host will also be used for the task.",
);

taskKeywords.set(
  "diff",
  "Toggle to make tasks return ‘diff’ information or not.",
);

taskKeywords.set(
  "environment",
  "A dictionary that gets converted into environment vars to be provided for the task upon execution. This can ONLY be used with modules. This isn’t supported for any other type of plugins nor Ansible itself nor its configuration, it just sets the variables for the code responsible for executing the task. This is not a recommended way to pass in confidential data.",
);

taskKeywords.set(
  "failed_when",
  "Conditional expression that overrides the task’s normal ‘failed’ status.",
);

taskKeywords.set(
  "ignore_errors",
  "Boolean that allows you to ignore task failures and continue with play. It does not affect connection errors.",
);

taskKeywords.set(
  "ignore_unreachable",
  "Boolean that allows you to ignore task failures due to an unreachable host and continue with the play. This does not affect other task errors (see ignore_errors) but is useful for groups of volatile/ephemeral hosts.",
);

taskKeywords.set(
  "local_action",
  "Same as action but also implies delegate_to: localhost",
);

taskKeywords.set(
  "loop",
  "Takes a list for the task to iterate over, saving each list element into the item variable (configurable via loop_control)",
);

taskKeywords.set(
  "loop_control",
  "Several keys here allow you to modify/set loop behavior in a task.",
);

taskKeywords.set(
  "module_defaults",
  "Specifies default parameter values for modules.",
);

taskKeywords.set(
  "name",
  "Identifier. Can be used for documentation, or in tasks/handlers.",
);

taskKeywords.set("no_log", "Boolean that controls information disclosure.");

taskKeywords.set(
  "notify",
  "List of handlers to notify when the task returns a ‘changed=True’ status.",
);

taskKeywords.set(
  "poll",
  "Sets the polling interval in seconds for async tasks (default 10s).",
);

taskKeywords.set(
  "port",
  "Used to override the default port used in a connection.",
);

taskKeywords.set(
  "register",
  "Name of variable that will contain task status and module return data.",
);

taskKeywords.set(
  "remote_user",
  "User used to log into the target via the connection plugin.",
);

taskKeywords.set(
  "retries",
  "Number of retries before giving up in a until loop. This setting is only used in combination with until.",
);

taskKeywords.set(
  "run_once",
  "Boolean that will bypass the host loop, forcing the task to attempt to execute on the first host available and afterwards apply any results and facts to all active hosts in the same batch.",
);

taskKeywords.set(
  "tags",
  "Tags applied to the task or included tasks, this allows selecting subsets of tasks from the command line.",
);

taskKeywords.set(
  "throttle",
  "Limit number of concurrent task runs on task, block and playbook level. This is independent of the forks and serial settings, but cannot be set higher than those limits. For example, if forks is set to 10 and the throttle is set to 15, at most 10 hosts will be operated on in parallel.",
);

taskKeywords.set(
  "timeout",
  "Time limit for task to execute in, if exceeded Ansible will interrupt and fail the task.",
);

taskKeywords.set(
  "until",
  "This keyword implies a ‘retries loop’ that will go on until the condition supplied here is met or we hit the retries limit.",
);

taskKeywords.set("vars", "Dictionary/map of variables");

taskKeywords.set(
  "when",
  "Conditional expression, determines if an iteration of a task is run or not.",
);

taskKeywords.set(
  "listen",
  `Allows handlers to listen on topics that can group multiple handlers.

  NOTE:
  Applies only to handlers. See [listen](https://docs.ansible.com/ansible/latest/user_guide/playbooks_intro.html#handlers-running-when-notified)`,
);

export const playExclusiveKeywords = new Map(
  [...playKeywords].filter(
    ([k]) =>
      !taskKeywords.has(k) && !roleKeywords.has(k) && !blockKeywords.has(k),
  ),
);

export const playWithoutTaskKeywords = new Map(
  [...playKeywords].filter(([k]) => !taskKeywords.has(k)),
);

export function isTaskKeyword(value: string): boolean {
  return taskKeywords.has(value) || value.startsWith("with_");
}
