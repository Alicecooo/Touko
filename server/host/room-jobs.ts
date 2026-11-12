import type { GroupRecord } from "../storage/store.ts";
import type { RoomQueueEntry } from "../../shared/wire.ts";

export interface RoomRoundLine { current?: string; pending: string[] }

export interface RoomJobsDeps {
  // Compatibility seam for callers while group conversations are removed.
  coordinator?: unknown;
  operations?: (groupId: string) => Iterable<{ threadId: string; cancelled: boolean; line?: RoomRoundLine }>;
  speakerOf?: (threadId: string) => string | undefined;
}

export function createRoomJobs(_deps: RoomJobsDeps = {}) {
  return {
    roomLineOf: (_record: GroupRecord): RoomQueueEntry[] => [],
    advanceRound: (_operation: { line?: RoomRoundLine }, _current: string | undefined, _spoken: ReadonlySet<string>): boolean => false,
  };
}
