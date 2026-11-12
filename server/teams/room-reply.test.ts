import { describe, expect, it } from "vitest";

import type { WireMessage as Message } from "../../shared/wire.ts";
import {
  asOwnVoice, isExplicitPass, isPassText, otherVoices, roomTurnNarrationIds, roomTurnReply, shouldReaskRoomSummary,
} from "./room-reply.ts";

const text = (id: string, turnId: string | undefined, extra: Partial<Message> = {}): Message => ({
  id,
  at: 0,
  role: "bot",
  kind: "text",
  text: id,
  ...(turnId ? { turnId } : {}),
  ...extra,
}) as Message;

describe("room replies", () => {
  it("is the turn's final message, not its working notes", () => {
    expect(roomTurnReply(["I'll check my own work history…", "Good, correct layer id…", "Done: the title is fixed."]))
      .toBe("Done: the title is fixed.");
  });

  it("is nothing when the turn said nothing or passed", () => {
    expect(roomTurnReply([])).toBe("");
    expect(roomTurnReply(["  "])).toBe("");
    expect(roomTurnReply(["Working on it", "(pass)"])).toBe("");
    for (const pass of ["pass", "(pass)", "Pass.", " ( pass ) "]) {
      expect(isPassText(pass)).toBe(true);
      expect(isExplicitPass(pass)).toBe(true);
    }
    expect(isPassText("")).toBe(true);
    expect(isExplicitPass("")).toBe(false);
    expect(isPassText("passing the build now")).toBe(false);
  });

  it("lets a group member stay silent, and still asks a 1:1 or a worked turn for a result", () => {
    expect(shouldReaskRoomSummary("(pass)", { didWork: false, direct: false })).toBe(false);
    expect(shouldReaskRoomSummary("(pass)", { didWork: true, direct: false })).toBe(false);
    expect(shouldReaskRoomSummary("", { didWork: false, direct: false })).toBe(false);
    expect(shouldReaskRoomSummary("", { didWork: true, direct: false })).toBe(true);
    expect(shouldReaskRoomSummary("Done.", { didWork: true, direct: false })).toBe(false);
    expect(shouldReaskRoomSummary("(pass)", { didWork: false, direct: true })).toBe(true);
    expect(shouldReaskRoomSummary("", { didWork: false, direct: true })).toBe(true);
  });

  it("keeps a bot's own words and drops lines spoken as someone else", () => {
    const others = otherVoices("Bee", ["Bee", "Atlas", ""], "Omkar");
    expect(others).toEqual(["Atlas", "Omkar"]);
    expect(asOwnVoice("I'll take the API.\nAtlas: I'll take the UI.\nOmkar: thanks", "Bee", others))
      .toBe("I'll take the API.");
    expect(asOwnVoice("Bee: the title is fixed.", "Bee", others)).toBe("the title is fixed.");
    expect(asOwnVoice("@Atlas: ship it", "Bee", others)).toBe("");
    expect(asOwnVoice("Atlas said: ship it", "Bee", others)).toBe("Atlas said: ship it");
    expect(asOwnVoice("```\nAtlas: example\n```\nReal note.", "Bee", others)).toBe("```\nAtlas: example\n```\nReal note.");
    expect(asOwnVoice("(pass)", "Bee", others)).toBe("(pass)");
  });

  it("finds the working notes of settled turns only", () => {
    const messages = [
      { id: "u", at: 0, role: "user", kind: "text", text: "go" } as Message,
      text("n1", "t1"),
      text("n2", "t1"),
      text("final", "t1", { turnTerminal: true }),
      text("live1", "t2"),
      text("live2", "t2"),
      text("audio", "t3", { attachments: [{ kind: "audio", path: "/a.m4a", mime: "audio/mp4" }] } as Partial<Message>),
      text("t3final", "t3", { turnTerminal: true }),
      text("legacy", undefined),
    ];
    expect([...roomTurnNarrationIds(messages)]).toEqual(["n1", "n2"]);
  });
});
