// What crosses from the launching shell into a fixture server: only what a
// test scripted on purpose. A real OpenAI key must never reach a fixture that
// could send it to OpenAI.
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { verificationServerEnvironment } from "../../scripts/dev/isolated-environment.ts";

const childEnv = (parentEnv: NodeJS.ProcessEnv) => verificationServerEnvironment(parentEnv, join(tmpdir(), "omb-fixture-env"), 9100);

describe("a fixture driven from a real browser", () => {
  it("trusts this machine's browsers as `pnpm dev` does, unless the caller tests the sign-in", () => {
    expect(childEnv({}).OMB_DEV_TRUST_LOCAL_BROWSER).toBe("1");
    expect(childEnv({ OMB_DEV_TRUST_LOCAL_BROWSER: "0" })).not.toHaveProperty("OMB_DEV_TRUST_LOCAL_BROWSER");
  });
});

describe("the fixture's fake engine knobs", () => {
  it("lets the Claude fake's knobs and the Codex fake's background-call knobs cross, and nothing else", () => {
    const env = childEnv({
      FAKE_CLAUDE_TEXT_ROUTES: "/tmp/routes.json", FAKE_CODEX_TEXT_ROUTES: "/tmp/codex-routes.json", FAKE_CODEX_TEXT_LOG: "/tmp/codex.jsonl",
      FAKE_CODEX_MODE: "approval", FAKE_CODEX_DUMP: "/tmp/codex-dump.json", SOME_SECRET: "x",
    });
    expect(env).toMatchObject({ FAKE_CLAUDE_TEXT_ROUTES: "/tmp/routes.json", FAKE_CODEX_TEXT_ROUTES: "/tmp/codex-routes.json", FAKE_CODEX_TEXT_LOG: "/tmp/codex.jsonl" });
    for (const key of ["FAKE_CODEX_MODE", "FAKE_CODEX_DUMP", "SOME_SECRET"]) expect(env, key).not.toHaveProperty(key);
  });
});

describe("the isolated environment", () => {
  it("lets the Pro answer cross only as OMB_PRO_PLAN=1", () => {
    expect(childEnv({ OMB_PRO_PLAN: "1" })).toMatchObject({ OMB_PRO_PLAN: "1" });
    for (const value of [undefined, "", "0", "true", "yes"]) expect(childEnv({ OMB_PRO_PLAN: value }), String(value)).not.toHaveProperty("OMB_PRO_PLAN");
  });
});
