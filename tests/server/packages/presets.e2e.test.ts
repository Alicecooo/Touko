import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

import { launchVerificationServer } from "../../../scripts/dev/isolated-environment.ts";
import { canonicalJson, parsePackageDocument } from "../../../shared/package-format.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/packages");
it("offers an organization library's presets in New bot until the publisher withdraws the release", async () => {
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const key = randomBytes(32).toString("hex");
  const fixture = await launchVerificationServer({ ...process.env, OMB_TEST_ORG_LIBRARY_KEY: key });
  console.log(JSON.stringify({ fixture: fixture.info }));
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const document: any = parsePackageDocument(JSON.parse(readFileSync(join(FIXTURES, "library-only.v2.json"), "utf8")), { trust: "file" });
    document.package.publisher = { organization: "acme", name: "Acme Partners" };
    const bytes = canonicalJson(document);
    const digest = sha(bytes);
    const blobs = join(fixture.info.dataDir, "org-library", "blobs");
    mkdirSync(blobs, { recursive: true });
    writeFileSync(join(blobs, `${digest}.json`), bytes, { mode: 0o600 });
    const packageId = "44444444-4444-4444-8444-444444444444";
    const catalog = (withdrawn: boolean) => JSON.stringify({
      format: "openmaus.org-library", version: 1, libraryVersion: withdrawn ? 2 : 1, organization: { id: "11111111-1111-4111-8111-111111111111", name: "Customer Co" },
      packages: [{
        packageId, ref: "acme/sales-skills", name: "Sales skills", tagline: document.package.tagline, kind: "library",
        publisher: { organizationId: "33333333-3333-4333-8333-333333333333", name: "Acme Partners", self: false }, mode: "available", offAction: "keep",
        release: withdrawn ? null : { version: "2.0.1", sha256: digest, sizeBytes: Buffer.byteLength(bytes), formatVersion: 2, publishedAt: 1_700_000_000_000, notes: "" },
        withdrawnReleases: withdrawn ? [{ version: "2.0.1", sha256: digest }] : [],
        contents: { bots: 0, skills: 2, presets: 1, routines: 0, connections: 0, botNames: [] },
        scanFindings: 0,
      }],
    });
    const relay = (body: string) => call("POST", "/api/testing/org-library", {
      library: { adminOrigin: "https://admin.example.com", organizationId: "11111111-1111-4111-8111-111111111111", organizationName: "Customer Co", digest: sha(body), catalog: body },
    }, { "x-openmausbot-test-org-library": key });
    expect((await relay(catalog(false))).status).toBe(200);
    const added = await call("POST", "/api/org-library/add", { packageId });
    expect(added.status).toBe(201);
    expect(added.body.presets).toEqual([{ id: expect.any(String), key: "support", name: "Support agent" }]);
    const presetId = added.body.presets[0].id as string;
    const state = JSON.parse(readFileSync(join(fixture.info.dataDir, "org-library", "state.json"), "utf8"));
    expect(state.installs[added.body.installId].presets).toEqual({ support: { presetId, r: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect((await call("GET", "/api/bot-presets")).body.presets).toEqual([expect.objectContaining({
      id: presetId, source: "org", publisherName: "Acme Partners", skillsEnabled: true, skills: [{ name: "objection-handling", description: "Answer common objections." }],
    })]);
    const created = await call("POST", "/api/bots", { name: "Sky", useDefaults: false, preset: presetId });
    expect(created.status).toBe(201);
    expect((await call("GET", `/api/bots/${created.body.bot.id}/skills`)).body.skills)
      .toEqual([expect.objectContaining({ name: "objection-handling", enabled: true, source: "org:acme/sales-skills@2.0.1" })]);
    expect((await call("POST", "/api/org-library/add", { packageId })).body).toEqual({ alreadyAdded: true, installId: added.body.installId });

    expect((await relay(catalog(true))).status).toBe(200);
    await expect.poll(async () => (await call("GET", "/api/bot-presets")).body.presets, { timeout: 10_000 }).toEqual([]);
    expect((await call("POST", "/api/bots", { name: "Sky 2", useDefaults: false, preset: presetId })).status).toBe(404);
    expect((await call("GET", "/api/bots")).body.bots.some((bot: { id: string }) => bot.id === created.body.bot.id)).toBe(true);
    expect((await call("GET", `/api/bots/${created.body.bot.id}/skills`)).body.skills)
      .toEqual([expect.objectContaining({ name: "objection-handling", enabled: false, source: "org:acme/sales-skills@2.0.1" })]);
  } finally {
    await fixture.close();
  }
}, 120_000);
