import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./DesktopCapabilities", () => ({
  useDesktopCapabilities: () => ({}),
}));

import { teamImportPreview } from "@/lib/team-import";
import type { ShareResponse } from "@/lib/team-share";
import { ShareTeamContents } from "./ShareTeamDialog";
import { TeamImportDetails } from "./TeamLibraryPanel";
import { packageSummary, parsePackageDocument } from "../../shared/package-format";

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, "../../tests/fixtures/packages", name), "utf8"));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Preset files", () => {
  it("counts preset bots in a team file", () => {
    const document = parsePackageDocument(fixture("full-team.v2.json"));
    const preview: ShareResponse = { document, filename: "f", summary: packageSummary(document), choices: { skills: [] }, redacted: [], skipped: [] };
    expect(text(renderToStaticMarkup(createElement(ShareTeamContents, { preview, includeMemory: true, localSkips: [] })))).toContain("Preset bots 1 · Support agent");
    const withoutPresets = parsePackageDocument({ ...fixture("full-team.v2.json"), package: { ...fixture("full-team.v2.json").package, presets: undefined } });
    const plain: ShareResponse = { ...preview, document: withoutPresets, summary: packageSummary(withoutPresets) };
    expect(text(renderToStaticMarkup(createElement(ShareTeamContents, { preview: plain, includeMemory: true, localSkips: [] })))).not.toContain("Preset bots");
  });

  it("previews a preset file's import as preset bots for New bot, with no team members", () => {
    const words = text(renderToStaticMarkup(createElement(TeamImportDetails, { pending: teamImportPreview(fixture("library-only.v2.json")), importedNames: [] })));
    expect(words).toContain("Preset bots: 1 · appear in New bot");
    expect(words).toContain("Preset bots — added to New bot Support agent");
    expect(words).not.toContain("0 playbooks");
    expect(words).toContain("Offered skills — not added to any bot follow-up");
    expect(words).toContain("The preset bots appear in New bot, above the built-in roles.");
    expect(words).not.toContain("Team members");
    expect(words).not.toContain("group chats");
    expect(text(renderToStaticMarkup(createElement(TeamImportDetails, { pending: teamImportPreview(fixture("full-team.v2.json")), importedNames: ["Morgan", "Scout", "Quill"] }))))
      .toContain("Preset bots: 1 · appear in New bot");
  });
});
