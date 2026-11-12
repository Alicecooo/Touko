/** The conversation a room was created with. The open task is only what the
 * client is showing, so posts and cross-room work must not follow it. */
export interface RoomThreadHome {
  threadId: string;
  dm?: boolean;
  tasks?: readonly { threadId: string; createdAt: number }[];
}

export function roomHomeThreadId(group: RoomThreadHome): string {
  if (group.dm || !group.tasks?.length) return group.threadId;
  let home = group.tasks[0]!;
  for (const task of group.tasks) {
    if (task.createdAt < home.createdAt || (task.createdAt === home.createdAt && task.threadId < home.threadId)) {
      home = task;
    }
  }
  return home.threadId;
}
