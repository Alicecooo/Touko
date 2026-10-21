import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WINDOWS_VENDOR_VERSION, WINDOWS_VENDOR_TARGET, WINDOWS_VENDOR_SOURCE, WINDOWS_VENDOR_PATCH_SHA256 } from "../../scripts/build/build-windows-browser-vendor.mjs";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function verifyVendorCandidate(provenance, bytes) {
  assert.equal(provenance.version, WINDOWS_VENDOR_VERSION);
  assert.equal(provenance.target, WINDOWS_VENDOR_TARGET);
  assert.deepEqual(provenance.source, WINDOWS_VENDOR_SOURCE);
  assert.equal(provenance.patch.sha256, WINDOWS_VENDOR_PATCH_SHA256);
  assert.equal(provenance.executable.asset, "agent-browser-win32-x64.exe");
  assert.equal(provenance.executable.bytes, bytes.length, "Candidate executable size differs from build provenance");
  assert.equal(provenance.executable.sha256, digest(bytes), "Candidate executable SHA-256 differs from build provenance");
}
