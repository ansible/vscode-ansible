import * as yaml from "yaml";

/**
 * Extract task names from a task list
 */
function extractTaskNames(taskList: unknown[]): string[] {
  const taskNames: string[] = [];
  for (const task of taskList) {
    if (task && typeof task === "object" && "name" in task && task.name) {
      taskNames.push(task.name as string);
    }
  }
  return taskNames;
}

/**
 * Extract tasks from a single play
 */
function extractTasksFromPlay(play: Record<string, unknown>): string[] {
  const tasks: string[] = [];

  // Extract from tasks
  if (play.tasks && Array.isArray(play.tasks)) {
    tasks.push(...extractTaskNames(play.tasks));
  }

  // Extract from pre_tasks
  if (play.pre_tasks && Array.isArray(play.pre_tasks)) {
    tasks.push(...extractTaskNames(play.pre_tasks));
  }

  // Extract from post_tasks
  if (play.post_tasks && Array.isArray(play.post_tasks)) {
    tasks.push(...extractTaskNames(play.post_tasks));
  }

  return tasks;
}

/**
 * Generate an outline (numbered list of tasks) from a playbook YAML
 * This mimics the WCA backend behavior for createOutline
 */
export function generateOutlineFromPlaybook(playbookYaml: string): string {
  try {
    const parsed = yaml.parse(playbookYaml);

    if (!parsed || !Array.isArray(parsed)) {
      return "";
    }

    const tasks: string[] = [];

    // Extract tasks from all plays
    for (const play of parsed) {
      if (play && typeof play === "object") {
        tasks.push(...extractTasksFromPlay(play as Record<string, unknown>));
      }
    }

    // Format as numbered list
    return tasks.map((task, index) => `${index + 1}. ${task}`).join("\n");
  } catch (error) {
    console.error("[Outline Generator] Failed to parse playbook:", error);
    return "";
  }
}

/**
 * Generate an outline from role tasks YAML
 */
export function generateOutlineFromRole(roleYaml: string): string {
  try {
    const parsed = yaml.parse(roleYaml);

    if (!parsed || !Array.isArray(parsed)) {
      return "";
    }

    const tasks: string[] = [];

    // Extract task names
    for (const task of parsed) {
      if (task.name) {
        tasks.push(task.name);
      }
    }

    // Format as numbered list
    return tasks.map((task, index) => `${index + 1}. ${task}`).join("\n");
  } catch (error) {
    console.error("[Outline Generator] Failed to parse role:", error);
    return "";
  }
}

/**
 * Regenerate playbook with refined outline
 * Extracts the task descriptions from the numbered outline
 */
export function parseOutlineToTaskList(outline: string): string[] {
  return outline
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Remove leading number and dot (e.g., "1. Task name" -> "Task name")
      return line.replace(/^\d+\.\s*/, "");
    });
}
