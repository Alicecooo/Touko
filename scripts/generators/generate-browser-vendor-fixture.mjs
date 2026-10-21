// Produce the fixed candidate read by the browser vendor verification tests.
// Run explicitly after changing vendor pins, then review the JSON before keeping it.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WINDOWS_VENDOR_VERSION, WINDOWS_VENDOR_TARGET, WINDOWS_VENDOR_SOURCE, WINDOWS_VENDOR_PATCH_SHA256 } from "../build/build-windows-browser-vendor.mjs";

const payload = "synthetic candidate, never executed";
const bytes = Buffer.from(payload);
const fixture = {
  payload,
  provenance: {
    version: WINDOWS_VENDOR_VERSION, target: WINDOWS_VENDOR_TARGET, source: WINDOWS_VENDOR_SOURCE,
    patch: { sha256: WINDOWS_VENDOR_PATCH_SHA256 },
    executable: { asset: "agent-browser-win32-x64.exe", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
  },
};
writeFileSync(fileURLToPath(new URL("../../tests/fixtures/browser-vendor-candidate.json", import.meta.url)), JSON.stringify(fixture, null, 2) + "\n");
