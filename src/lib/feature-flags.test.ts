import { describe, expect, it } from "vitest";

import { llmThreadTitlesEnabled, roomMemoryCaptureEnabled, routinesInConversationEnabled, shareLearnedSkillsMode, sharedComputersEnabled, showToolCallsEnabled, skillAuthoringEnabled } from "./feature-flags";

describe("feature flags", () => {
  it("keeps skill authoring on by default, before and after the config arrives", () => {
    expect(skillAuthoringEnabled(null)).toBe(true);
    expect(skillAuthoringEnabled({})).toBe(true);
    expect(skillAuthoringEnabled({ features: {} })).toBe(true);
    expect(skillAuthoringEnabled({ features: { skillAuthoring: true } })).toBe(true);
  });

  it("switches skill authoring off only on an explicit opt-out", () => {
    expect(skillAuthoringEnabled({ features: { skillAuthoring: false } })).toBe(false);
  });

  it("hides tool-call chips by default", () => {
    expect(showToolCallsEnabled(null)).toBe(false);
    expect(showToolCallsEnabled({})).toBe(false);
    expect(showToolCallsEnabled({ features: { showToolCalls: false } })).toBe(false);
  });

  it("shows tool-call chips only after explicit opt-in", () => {
    expect(showToolCallsEnabled({ features: { showToolCalls: true } })).toBe(true);
    expect(routinesInConversationEnabled(null)).toBe(false);
    expect(routinesInConversationEnabled({})).toBe(false);
    expect(routinesInConversationEnabled({ features: { routinesInConversation: true } })).toBe(true);
  });

  it("keeps computer sharing off unless the server says it is on", () => {
    expect(sharedComputersEnabled(null)).toBe(false);
    expect(sharedComputersEnabled({})).toBe(false);
    expect(sharedComputersEnabled({ features: {} })).toBe(false);
    expect(sharedComputersEnabled({ features: { sharedComputers: false } })).toBe(false);
    expect(sharedComputersEnabled({ features: { sharedComputers: true } })).toBe(true);
  });

  it("offers Regenerate title only while the server has generated titles on", () => {
    expect(llmThreadTitlesEnabled(null)).toBe(false);
    expect(llmThreadTitlesEnabled({ features: {} })).toBe(false);
    expect(llmThreadTitlesEnabled({ features: { llmThreadTitles: false } })).toBe(false);
    expect(llmThreadTitlesEnabled({ features: { llmThreadTitles: true } })).toBe(true);
  });

  it("keeps Learn from group chats off until it is switched on", () => {
    expect(roomMemoryCaptureEnabled(null)).toBe(false);
    expect(roomMemoryCaptureEnabled({ features: {} })).toBe(false);
    expect(roomMemoryCaptureEnabled({ features: { roomMemoryCapture: true } })).toBe(true);
  });

  it("offers sharing learned skills only with the skills library, asking by default", () => {
    expect(shareLearnedSkillsMode(null)).toBe("off");
    expect(shareLearnedSkillsMode({ features: { shareLearnedSkills: "auto" } })).toBe("off");
    expect(shareLearnedSkillsMode({ features: { skillsLibrary: true } })).toBe("ask");
    expect(shareLearnedSkillsMode({ features: { skillsLibrary: true, shareLearnedSkills: "auto" } })).toBe("auto");
    expect(shareLearnedSkillsMode({ features: { skillsLibrary: true, shareLearnedSkills: "off" } })).toBe("off");
  });
});
