import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  CLOUDFLARED_ASSETS,
  CLOUDFLARED_VERSION,
  executableTarget,
  parsePrepareCloudflaredArgs,
  releaseBytes,
  sha256,
  targetForCurrentHost,
  targetsForHost,
  targetsForPreparation,
  verifyPinnedBinary,
  verifySha256,
} from "../../scripts/setup/prepare-https-tunnel.mjs";

describe("cloudflared download retries", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function mockDownload() {
    vi.useFakeTimers();
    vi.stubEnv("OMB_CLOUDFLARED_ARCHIVE_DIR", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("recovers from an HTTP 504 and verifies the recovered bytes normally", async () => {
    const fetchMock = mockDownload();
    const bytes = Buffer.from("downloaded release");
    fetchMock.mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response(bytes));
    const download = releaseBytes({ name: "cloudflared-linux-amd64" });
    await vi.runAllTimersAsync();
    const result = await download;
    expect(result).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(verifySha256(result, sha256(bytes))).toBe(sha256(bytes));
    expect(() => verifySha256(result, sha256(Buffer.from("other release")))).toThrow(/SHA-256 verification/);
  });

  it("retries a network error and an interrupted response body", async () => {
    const fetchMock = mockDownload();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => { throw new TypeError("terminated"); } })
      .mockResolvedValueOnce(new Response("complete"));
    const download = releaseBytes({ name: "cloudflared-linux-amd64" });
    await vi.runAllTimersAsync();
    expect(await download).toEqual(Buffer.from("complete"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops after three transient failures", async () => {
    const fetchMock = mockDownload();
    fetchMock.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const result = expect(releaseBytes({ name: "cloudflared-linux-amd64" })).rejects.toThrow(/HTTP 503/);
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails immediately for a missing pinned asset", async () => {
    const fetchMock = mockDownload();
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(releaseBytes({ name: "missing" })).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const PINNED_ASSETS = {
  "linux-x64": {
    name: "cloudflared-linux-amd64",
    sha256: "fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2",
    binarySha256: "fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2",
    archive: false,
  },
  "linux-arm64": {
    name: "cloudflared-linux-arm64",
    sha256: "7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790",
    binarySha256: "7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790",
    archive: false,
  },
  "win32-x64": {
    name: "cloudflared-windows-amd64.exe",
    sha256: "c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5",
    binarySha256: "c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5",
    archive: false,
  },
};

const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

function executableFixture(target) {
  const bytes = Buffer.alloc(128);
  if (target === "darwin-arm64" || target === "darwin-x64") {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(target === "darwin-arm64" ? 0x0100000c : 0x01000007, 4);
  } else if (target === "linux-x64" || target === "linux-arm64") {
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(bytes);
    bytes.writeUInt16LE(target === "linux-arm64" ? 183 : 62, 18);
  } else if (target === "win32-x64") {
    bytes.write("MZ", 0, "ascii");
    bytes.writeUInt32LE(0x40, 0x3c);
    bytes.write("PE\0\0", 0x40, "binary");
    bytes.writeUInt16LE(0x8664, 0x44);
  }
  return bytes;
}

describe("pinned cloudflared packaging", () => {
  it("stages the supported desktop targets", () => {
    expect(targetsForHost("linux")).toEqual(["linux-x64"]);
    expect(targetsForHost("win32")).toEqual(["win32-x64"]);
    expect(() => targetsForHost("freebsd")).toThrow(/unsupported/);
  });

  it("stages the exact current target for development and self-hosting", () => {
    expect(targetForCurrentHost("linux", "x64")).toBe("linux-x64");
    expect(targetForCurrentHost("linux", "arm64")).toBe("linux-arm64");
    expect(targetForCurrentHost("win32", "x64")).toBe("win32-x64");
    expect(targetsForPreparation({ current: true, platform: "linux", arch: "arm64" })).toEqual([
      "linux-arm64",
    ]);
    expect(() => targetForCurrentHost("linux", "arm")).toThrow(/unsupported/);
  });

  it("accepts only the documented current-target CLI option", () => {
    expect(parsePrepareCloudflaredArgs([])).toEqual({ current: false });
    expect(parsePrepareCloudflaredArgs(["--current"])).toEqual({ current: true });
    expect(() => parsePrepareCloudflaredArgs(["--all"])).toThrow(/Usage:/);
    expect(() => parsePrepareCloudflaredArgs(["--current", "--current"])).toThrow(/Usage:/);
    // `openmausbot serve --tunnel` stages into its data dir
    expect(parsePrepareCloudflaredArgs(["--current", "--root", "/srv/omb"])).toEqual({ current: true, root: "/srv/omb" });
    expect(() => parsePrepareCloudflaredArgs(["--root"])).toThrow(/Usage:/);
    expect(() => parsePrepareCloudflaredArgs(["--root", "/a", "--root", "/b"])).toThrow(/Usage:/);
  });

  it("pins a complete release asset and digest for every supported target", () => {
    expect(CLOUDFLARED_VERSION).toBe("2026.8.2");
    expect(CLOUDFLARED_ASSETS).toEqual(PINNED_ASSETS);
  });

  it("rejects altered release bytes", () => {
    const payload = Buffer.from("official bytes");
    const digest = sha256(payload);
    expect(verifySha256(payload, digest)).toBe(digest);
    expect(() => verifySha256(Buffer.from("altered"), digest)).toThrow(/SHA-256 verification/);
  });

  it("recognizes only the executable formats and architectures we ship", () => {
    for (const target of Object.keys(PINNED_ASSETS)) {
      expect(executableTarget(executableFixture(target))).toBe(target);
    }
    expect(() => executableTarget(Buffer.from("not an executable"))).toThrow(/unsupported/);
  });

  it.each(["linux-x64", "linux-arm64"])("rejects the wrong architecture and unpinned bytes for %s", (target) => {
    const bytes = executableFixture(target);
    const other = target === "linux-arm64" ? "linux-x64" : "linux-arm64";
    expect(() => verifyPinnedBinary(bytes, other)).toThrow(/architecture mismatch/);
    expect(() => verifyPinnedBinary(bytes, target)).toThrow(/SHA-256 verification/);
  });

  it("does not mistake 32-bit, big-endian, truncated or unsupported ELF files for ARM64", () => {
    const arm32 = executableFixture("linux-arm64");
    arm32[4] = 1;
    const bigEndian = executableFixture("linux-arm64");
    bigEndian[5] = 2;
    bigEndian.writeUInt16BE(183, 18);
    const otherMachine = executableFixture("linux-arm64");
    otherMachine.writeUInt16LE(40, 18); // EM_ARM is not AArch64.
    const truncated = executableFixture("linux-arm64").subarray(0, 19);
    for (const bytes of [arm32, bigEndian, otherMachine, truncated]) {
      expect(() => executableTarget(bytes)).toThrow(/unsupported/);
    }
  });
});
