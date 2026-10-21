import { verifyVendorCandidate } from "../checks/windows-browser-vendor.check.mjs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WINDOWS_VENDOR_PATCH_SHA256, WINDOWS_VENDOR_PNPM, WINDOWS_VENDOR_RUST, WINDOWS_VENDOR_SOURCE, WINDOWS_VENDOR_TARGET, WINDOWS_VENDOR_VERSION, parseVendorBuildArgs, verifyVendorPatch } from "../../scripts/build/build-windows-browser-vendor.mjs";
import { verifyAssetBytes } from "../../scripts/setup/prepare-browser-engine.mjs";

describe("reviewed Windows browser dependency build", () => {
  it("pins the released base, toolchain, vendor revision and exact patch bytes", () => {
    expect(WINDOWS_VENDOR_SOURCE.commit).toBe("eb05921bad874cd2a1b4fa5d1149f1ed26576cae");
    expect(WINDOWS_VENDOR_SOURCE.url).toContain(WINDOWS_VENDOR_SOURCE.commit);
    expect(WINDOWS_VENDOR_TARGET).toBe("x86_64-pc-windows-gnu");
    expect(WINDOWS_VENDOR_VERSION).toBe("0.36.0-omb.2");
    expect(WINDOWS_VENDOR_RUST).toBe("1.97.1");
    expect(WINDOWS_VENDOR_PNPM).toBe("11.1.3");
    expect(WINDOWS_VENDOR_PATCH_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const patch = readFileSync(new URL("../../third_party/browser/agent-browser-windows-stdio.patch", import.meta.url));
    expect(() => verifyVendorPatch(patch)).not.toThrow();
    expect(() => verifyVendorPatch(Buffer.concat([patch, Buffer.from("\n")]))).toThrow(/SHA-256/);
  });

  it("refuses unreviewed source archive bytes", () => {
    expect(() => verifyAssetBytes(Buffer.from("unreviewed source"), WINDOWS_VENDOR_SOURCE)).toThrow(/SHA-256/);
  });

  it("rejects changed candidate bytes or provenance instead of weakening normal release pins", () => {
    const fixture = JSON.parse(readFileSync(new URL("../fixtures/browser-vendor-candidate.json", import.meta.url), "utf8"));
    const bytes = Buffer.from(fixture.payload);
    const provenance = fixture.provenance;
    expect(() => verifyVendorCandidate(provenance, bytes)).not.toThrow();
    expect(() => verifyVendorCandidate(provenance, Buffer.from("wrong"))).toThrow();
    expect(() => verifyVendorCandidate({ ...provenance, version: "0.36.0" }, bytes)).toThrow();
    expect(() => verifyVendorCandidate({ ...provenance, source: { ...WINDOWS_VENDOR_SOURCE, commit: "unreviewed" } }, bytes)).toThrow();
    expect(() => verifyVendorCandidate({ ...provenance, patch: { sha256: "0".repeat(64) } }, bytes)).toThrow();
    expect(() => verifyVendorCandidate({ ...provenance, executable: { ...provenance.executable, sha256: "0".repeat(64) } }, bytes)).toThrow();
  });

  it("requires an explicit absolute output without accepting extra options", () => {
    const output = join(tmpdir(), "omb-vendor-output");
    expect(parseVendorBuildArgs(["--output", output])).toBe(output);
    for (const args of [[], ["--output", "relative"], ["--output", output, "--skip-verify"], ["--source", output]]) {
      expect(() => parseVendorBuildArgs(args)).toThrow(/Usage/);
    }
  });
});
