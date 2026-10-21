import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadUserSkills, mergeSkills, parseSkillManifest, renderSkillInstructions, selectBundledSkills, type BundledSkill } from "./skill-library.ts";

const instructionsFor = (text: string, capabilities: string[], skills: BundledSkill[], options?: { includeRoot?: boolean }) =>
  renderSkillInstructions(selectBundledSkills(text, capabilities, skills), options);

const browser: BundledSkill = {
  directory: "/skills/browser-harness",
  instructions: "---\nname: browser-harness\ndescription: test\n---\nUse browser tools.",
  manifest: {
    id: "browser-harness",
    name: "Browser Harness",
    version: "0.1.0",
    description: "Control a browser",
    defaultEnabled: true,
    triggerTerms: ["browser"],
    requiredCapabilities: ["browserMcp"],
  },
};

describe("bundled skill library", () => {
  it("selects a skill only when both its trigger and capability are present", () => {
    const rendered = instructionsFor("Open the browser", ["browserMcp"], [browser]);
    expect(rendered).toContain("Use browser tools");
    expect(rendered).not.toContain('root="/skills/browser-harness"');
    expect(instructionsFor("Open the browser", ["browserMcp"], [browser], { includeRoot: true }))
      .toContain('root="/skills/browser-harness"');
    expect(instructionsFor("Open the browser", [], [browser])).toBe("");
    expect(instructionsFor("Write a poem", ["browserMcp"], [browser])).toBe("");
  });

  it("requires the manifest id to match its isolated folder", () => {
    expect(() => parseSkillManifest({
      ...browser.manifest,
      id: "other-skill",
    }, "/skills/browser-harness")).toThrow(/invalid id/);
  });

  it("loads a user skill without letting a broken sibling disable it", () => {
    const root = mkdtempSync(join(tmpdir(), "openmausbot-skills-"));
    const valid = join(root, "file-expense");
    mkdirSync(valid);
    writeFileSync(join(valid, "manifest.json"), JSON.stringify({
      id: "file-expense", name: "File expense", version: "1.0.0", description: "File expenses",
      defaultEnabled: true, triggerTerms: ["expense"], requiredCapabilities: [],
    }));
    writeFileSync(join(valid, "SKILL.md"), "---\nname: file-expense\ndescription: File expenses\n---\nDo it safely.\n");
    const broken = join(root, "broken");
    mkdirSync(broken);
    writeFileSync(join(broken, "manifest.json"), "not json");
    writeFileSync(join(broken, "SKILL.md"), "broken");

    expect(loadUserSkills(root).map((skill) => skill.manifest.id)).toEqual(["file-expense"]);
  });

  it("does not let a user skill shadow a bundled skill id", () => {
    expect(mergeSkills([browser], [{ ...browser, instructions: "user replacement" }])).toEqual([browser]);
  });

  it("treats a non-directory user skill root as empty", () => {
    const root = mkdtempSync(join(tmpdir(), "openmausbot-skills-root-"));
    const file = join(root, "not-a-directory");
    writeFileSync(file, "nope");
    expect(loadUserSkills(file)).toEqual([]);
  });
});
