export function parsePlays(plays: unknown[]): unknown[] {
  if (!plays || !Array.isArray(plays) || plays.length === 0) {
    return [];
  }
  const tasks: unknown[] = [];
  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    if (typeof play !== "object" || play === null) {
      continue;
    }
    const tasksInAPlay = (play as Record<string, unknown>).tasks;
    if (Array.isArray(tasksInAPlay)) {
      for (const task of tasksInAPlay) {
        tasks.push(task);
      }
    } else {
      // If tasks are not found in the play,
      // add the play itself to the tasks list
      tasks.push(play);
    }
  }
  return tasks;
}
