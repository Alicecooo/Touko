import { describe, expect, it } from "vitest";

import { roomHomeThreadId } from "./room-home.ts";

describe("roomHomeThreadId", () => {
  it("keeps a direct chat on its only thread", () => {
    expect(roomHomeThreadId({ threadId: "dm", dm: true, tasks: [{ threadId: "side", createdAt: 1 }] })).toBe("dm");
  });

  it("uses the open thread when the room has no task list", () => {
    expect(roomHomeThreadId({ threadId: "room" })).toBe("room");
  });

  it("stays on the conversation the room was created with, not the task currently open", () => {
    expect(roomHomeThreadId({
      threadId: "side",
      tasks: [
        { threadId: "side", createdAt: 20 },
        { threadId: "home", createdAt: 10 },
      ],
    })).toBe("home");
  });

  it("breaks a creation-time tie by thread id", () => {
    expect(roomHomeThreadId({
      threadId: "b",
      tasks: [
        { threadId: "b", createdAt: 5 },
        { threadId: "a", createdAt: 5 },
      ],
    })).toBe("a");
  });
});
