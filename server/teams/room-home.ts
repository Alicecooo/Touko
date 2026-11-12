/** The conversation a room was created with. The open task is only what the
 * client is showing, so posts and cross-room work must not follow it. */
export interface RoomThreadHome {
  threadId: string;
  dm?: boolean;
  homeThreadId?: string;
  tasks?: readonly { threadId: string; createdAt: number }[];
}

function oldestTaskThreadId(tasks: readonly { threadId: string; createdAt: number }[]): string {
  let home = tasks[0]!;
  for (const task of tasks) {
    if (task.createdAt < home.createdAt || (task.createdAt === home.createdAt && task.threadId < home.threadId)) {
      home = task;
    }
  }
  return home.threadId;
}

export function roomHomeThreadId(group: RoomThreadHome): string {
  if (group.dm) return group.threadId;
  const tasks = group.tasks ?? [];
  const known = new Set(tasks.map((task) => task.threadId));
  if (group.homeThreadId && (known.has(group.homeThreadId) || (tasks.length === 0 && group.homeThreadId === group.threadId))) {
    return group.homeThreadId;
  }
  if (tasks.length === 0) return group.threadId;
  return oldestTaskThreadId(tasks);
}
