import * as yaml from "yaml";

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
    
    // Extract tasks from the playbook
    for (const play of parsed) {
      if (play.tasks && Array.isArray(play.tasks)) {
        for (const task of play.tasks) {
          if (task.name) {
            tasks.push(task.name);
          }
        }
      }
      
      // Also check pre_tasks and post_tasks
      if (play.pre_tasks && Array.isArray(play.pre_tasks)) {
        for (const task of play.pre_tasks) {
          if (task.name) {
            tasks.push(task.name);
          }
        }
      }
      
      if (play.post_tasks && Array.isArray(play.post_tasks)) {
        for (const task of play.post_tasks) {
          if (task.name) {
            tasks.push(task.name);
          }
        }
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

