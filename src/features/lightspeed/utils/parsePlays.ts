// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePlays(plays: any[]): any[] {
  if (!plays || !Array.isArray(plays) || plays.length === 0) {
    return [];
  }
  let tasks: string[] = [];
  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    const tasksInAPlay = play.tasks;
    if (tasksInAPlay) {
      tasks = tasks.concat(tasksInAPlay);
    } else {
      // If tasks are not found in the play,
      // add the play itself to the tasks list
      tasks.push(play);
    }
  }
  return tasks;
}
