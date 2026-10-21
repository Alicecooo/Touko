import { expect, it } from "vitest";
import { verifyTeamBackup } from "../../checks/team-backup.check.ts";

it("exports and imports through the real server, retains originals and continues the copied chat", async () => {
  expect(await verifyTeamBackup()).toMatchObject({ ok: true, originalConversationUnchanged: true, importedConversationContinued: true, standingInstructionsPreserved: true, templateSectionsIsolated: true });
}, 90_000);
