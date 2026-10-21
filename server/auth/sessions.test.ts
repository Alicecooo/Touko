import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as atomic from "../storage/atomic.ts";

import { SESSION_TTL_MS, SessionRegistry, STREAM_TICKET_TTL_MS, SESSION_MAX_AGE_MS, cookieMaxAgeSeconds, daysMs } from "./sessions.ts";

let dir: string;
let clock: number;
let registry: SessionRegistry;
const file = () => join(dir, "sessions.json");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "omb-sessions-"));
  clock = 1_700_000_000_000;
  registry = new SessionRegistry({ file: file(), now: () => clock });
});
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

function issueSession(label = "Test session") {
  return registry.issue({ label, scopes: ["admin", "client"] });
}

describe("sessions", () => {
  it("delegates membership only for internally marked portal grants, never ordinary email or a userId prefix", () => {
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => null, portalMembership: true });
    const portal = registry.issuePortal({ email: "person@example.test", grant: "g".repeat(43), scopes: ["client"] });
    const injected = { label: "ordinary", email: "person@example.test", userId: `portal:${"g".repeat(43)}`, scopes: ["client" as const], membershipAuthority: "portal" };
    const ordinary = registry.issue(injected);
    const paired = issueSession();
    expect(registry.authenticate(portal.token)?.membershipAuthority).toBe("portal");
    expect(portal.session).not.toHaveProperty("membershipAuthority");
    expect(registry.authenticate(ordinary.token)).toBeNull();
    expect(registry.authenticate(paired.token)?.membershipAuthority).toBeUndefined();
    expect(registry.authenticate(paired.token)?.id).toBe(paired.session.id);
    registry.close();
    const reloaded = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => null, portalMembership: true });
    expect(reloaded.authenticate(portal.token)?.id).toBe(portal.session.id);
    reloaded.close();
    const localAgain = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => null });
    expect(localAgain.authenticate(portal.token)).toBeNull();
    expect(localAgain.authenticate(paired.token)?.id).toBe(paired.session.id);
  });

  it("keeps portal grants locally narrowed by default and validates stored authority markers", () => {
    const portal = registry.issuePortal({ email: "person@example.test", grant: "g".repeat(43), scopes: ["client"] });
    expect(registry.authenticate(portal.token)).toBeNull();
    registry = new SessionRegistry({ file: file(), now: () => clock, portalMembership: true });
    const next = registry.issuePortal({ email: "person@example.test", grant: "h".repeat(43), scopes: ["client"] });
    const saved = JSON.parse(readFileSync(file(), "utf8"));
    saved.sessions[0].membershipAuthority = { untrusted: true };
    writeFileSync(file(), JSON.stringify(saved));
    const loaded = new SessionRegistry({ file: file(), now: () => clock, portalMembership: true });
    expect(loaded.authenticate(next.token)).toBeNull();
    expect(() => registry.issuePortal({ email: "person@example.test", grant: "bad", scopes: ["client"] })).toThrow("verified portal identity");
  });

  it("revokes every over-scoped email device and its tickets on demotion, but not local sessions", () => {
    let scopes: Array<"admin" | "client"> | null = ["admin", "client"];
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => scopes });
    const paired = issueSession();
    const first = registry.issue({ label: "browser", email: "person@example.test", scopes: ["admin", "client"] });
    const second = registry.issue({ label: "phone", email: "person@example.test", scopes: ["admin", "client"] });
    const member = registry.issue({ label: "member", email: "person@example.test", scopes: ["client"] });
    const tickets = [first, second].map(({ session }) => registry.issueStreamTicket(session.id).ticket);
    const revoked: string[] = [];
    registry.onSessionRevoked((id) => revoked.push(id));
    scopes = ["client"];
    expect(registry.authenticate(first.token)).toBeNull();
    expect(registry.isLive(second.session.id)).toBe(false);
    expect(tickets.map((ticket) => registry.redeemStreamTicket(ticket))).toEqual([null, null]);
    expect(revoked).toEqual([first.session.id, second.session.id]);
    expect(registry.authenticate(paired.token)?.scopes).toEqual(["admin", "client"]);
    expect(registry.authenticate(member.token)?.scopes).toEqual(["client"]);
    scopes = ["admin", "client"];
    expect(registry.authenticate(member.token)?.scopes).toEqual(["client"]);
    expect(registry.authenticate(first.token)).toBeNull();
    scopes = null;
    expect(registry.renew(member.session.id)).toBe(false);
    expect(registry.list().map((session) => session.id)).toEqual([paired.session.id]);
    const loaded = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["admin", "client"] });
    expect(loaded.authenticate(first.token)).toBeNull();
  });

  it.each([undefined, () => { throw new Error("membership unavailable"); }])("fails closed when email membership cannot be checked (%s)", (emailScopes) => {
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes });
    const paired = issueSession();
    const email = registry.issue({ label: "browser", email: "person@example.test", scopes: ["client"] });
    expect(registry.authenticate(email.token)).toBeNull();
    expect(registry.authenticate(paired.token)?.id).toBe(paired.session.id);
  });

  it("rechecks membership when a stream ticket is the first use after removal", () => {
    let allowed = true;
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => allowed ? ["client"] : null });
    const email = registry.issue({ label: "browser", email: "person@example.test", scopes: ["client"] });
    const { ticket } = registry.issueStreamTicket(email.session.id);
    allowed = false;
    expect(registry.redeemStreamTicket(ticket)).toBeNull();
    expect(registry.isLive(email.session.id)).toBe(false);
  });

  it("builds one membership resolver per pass and skips snapshots with no eligible account sessions", () => {
    const resolve = vi.fn((_email: string) => ["client" as const]);
    const snapshot = vi.fn(() => resolve);
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopesSnapshot: snapshot, portalMembership: true });
    issueSession();
    const portal = registry.issuePortal({ email: "portal@example.test", grant: "g".repeat(43), scopes: ["client"] });
    registry.revalidateEmailSessions();
    expect(snapshot).not.toHaveBeenCalled();
    registry.issue({ label: "first", email: "one@example.test", scopes: ["client"] });
    registry.issue({ label: "second", email: "two@example.test", scopes: ["client"] });
    snapshot.mockClear(); resolve.mockClear();
    registry.revalidateEmailSessions();
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls.map(([email]) => email)).toEqual(["one@example.test", "two@example.test"]);
    expect(registry.authenticate(portal.token)?.membershipAuthority).toBe("portal");
  });

  it("fails closed for every eligible account when a snapshot fails, without using the fallback", () => {
    let unavailable = false;
    const fallback = vi.fn(() => ["admin" as const, "client" as const]);
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: fallback,
      emailScopesSnapshot: () => { if (unavailable) throw new Error("private membership failure"); return () => ["client"]; },
    });
    const paired = issueSession();
    const first = registry.issue({ label: "first", email: "one@example.test", scopes: ["client"] });
    const second = registry.issue({ label: "second", email: "two@example.test", scopes: ["client"] });
    unavailable = true;
    registry.revalidateEmailSessions();
    expect(registry.authenticate(first.token)).toBeNull();
    expect(registry.authenticate(second.token)).toBeNull();
    expect(registry.authenticate(paired.token)?.id).toBe(paired.session.id);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("restores valid email and local sessions after clean shutdown, and rechecks one snapshot during load", () => {
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"] });
    const email = registry.issue({ label: "browser", email: "person@example.test", scopes: ["client"] });
    const paired = issueSession();
    expect(existsSync(`${file()}.open`)).toBe(true);
    if (process.platform !== "win32") expect(statSync(`${file()}.open`).mode & 0o777).toBe(0o600);
    registry.close(); registry.close();
    expect(existsSync(`${file()}.open`)).toBe(false);
    expect(() => registry.authenticate(email.token)).toThrow("closed");
    const snapshot = vi.fn(() => () => ["client" as const]);
    const loaded = new SessionRegistry({ file: file(), now: () => clock, emailScopesSnapshot: snapshot });
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(loaded.authenticate(email.token)?.id).toBe(email.session.id);
    expect(loaded.authenticate(paired.token)?.id).toBe(paired.session.id);
    loaded.close();
  });

  it("revokes restored email sessions if the constructor membership snapshot fails", () => {
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"] });
    const email = registry.issue({ label: "browser", email: "person@example.test", scopes: ["client"] });
    const paired = issueSession(); registry.close();
    const unavailable = new SessionRegistry({ file: file(), now: () => clock, emailScopesSnapshot: () => { throw new Error("unavailable"); } });
    expect(unavailable.authenticate(email.token)).toBeNull();
    unavailable.close();
    const restored = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"] });
    expect(restored.authenticate(email.token)).toBeNull();
    expect(restored.authenticate(paired.token)?.id).toBe(paired.session.id);
    restored.close();
  });

  it("never revives revoked email bearers after persistence failure, unclean restart, and membership restoration", () => {
    let allowed = true;
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => allowed ? ["client"] : null });
    const paired = issueSession();
    const email = registry.issue({ label: "browser", email: "person@example.test", scopes: ["client"] });
    const { ticket } = registry.issueStreamTicket(email.session.id);
    const saved = readFileSync(file(), "utf8");
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    // The real session file and boot marker stay on disk; every atomic write, including a clean close, now fails.
    const writes = vi.spyOn(atomic, "writeFileAtomic").mockImplementation(() => { throw new Error("EIO: private-path-and-token"); });
    allowed = false;
    registry.revalidateEmailSessions();
    expect(registry.authenticate(email.token)).toBeNull();
    expect(registry.redeemStreamTicket(ticket)).toBeNull();
    expect(readFileSync(file(), "utf8")).toBe(saved);
    expect(existsSync(`${file()}.open`)).toBe(true);
    expect(() => registry.close()).toThrow("Could not safely close session storage.");
    expect(() => new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"] })).toThrow("Could not establish safe session storage.");
    expect(logger.mock.calls.flat().join(" ")).not.toContain("private-path-and-token");
    writes.mockRestore(); allowed = true;
    const restarted = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"] });
    expect(restarted.authenticate(email.token)).toBeNull();
    expect(restarted.authenticate(paired.token)?.id).toBe(paired.session.id);
    restarted.close();
    const cleanRestart = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"] });
    expect(cleanRestart.authenticate(email.token)).toBeNull();
    expect(cleanRestart.authenticate(paired.token)?.id).toBe(paired.session.id);
    cleanRestart.close();
  });

  it("drops account and portal sessions but preserves local sessions after any unclean restart", () => {
    registry = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"], portalMembership: true });
    const paired = issueSession();
    const account = registry.issue({ label: "browser", email: "person@example.test", scopes: ["client"] });
    const portal = registry.issuePortal({ email: "person@example.test", grant: "g".repeat(43), scopes: ["client"] });
    const restarted = new SessionRegistry({ file: file(), now: () => clock, emailScopes: () => ["client"], portalMembership: true });
    expect(restarted.authenticate(account.token)).toBeNull();
    expect(restarted.authenticate(portal.token)).toBeNull();
    expect(restarted.authenticate(paired.token)?.id).toBe(paired.session.id);
    restarted.close();
  });

  it("refuses to load persisted sessions when the marker cannot be established on the real filesystem", () => {
    const blocked = join(dir, "blocked.json");
    const paired = issueSession();
    writeFileSync(blocked, readFileSync(file(), "utf8"));
    mkdirSync(`${blocked}.open`); // An atomic file replace cannot overwrite a directory, even as root.
    expect(() => new SessionRegistry({ file: blocked, now: () => clock })).toThrow("Could not establish safe session storage.");
    expect(readFileSync(blocked, "utf8")).toContain(paired.session.id);
  });

  it("stores only a hash, owner-only, and reloads from disk", () => {
    const { token, session } = issueSession();
    const onDisk = readFileSync(file(), "utf8");
    expect(onDisk).not.toContain(token);
    expect(onDisk).toContain(session.id);
    if (process.platform !== "win32") expect(statSync(file()).mode & 0o777).toBe(0o600); // Windows has no POSIX modes
    const reloaded = new SessionRegistry({ file: file(), now: () => clock });
    expect(reloaded.authenticate(token)?.id).toBe(session.id);
    expect(reloaded.authenticate("omb_sess_nope")).toBeNull();
  });

  it("expires after 30 days and can be revoked", () => {
    const { token, session } = issueSession();
    clock += SESSION_TTL_MS - 1;
    expect(registry.authenticate(token)?.id).toBe(session.id);
    clock += 2;
    expect(registry.authenticate(token)).toBeNull();
    const other = issueSession("iPad");
    expect(registry.list().map((s) => s.label)).toEqual(["iPad"]);
    expect(registry.revoke(other.session.id)).toBe(true);
    expect(registry.revoke(other.session.id)).toBe(false);
    expect(registry.authenticate(other.token)).toBeNull();
  });

  it("updates last-seen at most once a minute so reads stay cheap", () => {
    const { token } = issueSession();
    const before = statSync(file()).mtimeMs;
    clock += 1_000;
    registry.authenticate(token);
    expect(registry.list()[0]?.lastSeenAt).toBe(clock - 1_000);
    clock += 60_000;
    registry.authenticate(token);
    expect(registry.list()[0]?.lastSeenAt).toBe(clock);
    expect(statSync(file()).mtimeMs).toBeGreaterThanOrEqual(before);
  });

  it("renews a session with half its term or less left, and never revives an expired one", () => {
    const { token, session } = issueSession();
    clock += SESSION_TTL_MS / 2 - 60_000;
    expect(registry.renew(session.id)).toBe(false);
    expect(registry.list()[0]?.expiresAt).toBe(session.expiresAt);
    clock += 120_000;
    expect(registry.renew(session.id)).toBe(true);
    expect(registry.list()[0]?.expiresAt).toBe(clock + SESSION_TTL_MS);
    expect(registry.renew(session.id)).toBe(false);
    clock += SESSION_TTL_MS - 1;
    expect(registry.authenticate(token)?.id).toBe(session.id);
    expect(registry.renew(session.id)).toBe(true);
    const reloaded = new SessionRegistry({ file: file(), now: () => clock });
    expect(reloaded.list()[0]?.expiresAt).toBe(clock + SESSION_TTL_MS);
    const quiet = issueSession("iPad");
    clock += SESSION_TTL_MS + 1;
    expect(registry.renew(quiet.session.id)).toBe(false);
    expect(registry.authenticate(quiet.token)).toBeNull();
  });

  it("stops renewing at the absolute cap counted from issuance", () => {
    const { token, session } = issueSession();
    const cap = session.createdAt + SESSION_MAX_AGE_MS;
    let last = session.expiresAt;
    for (let i = 0; i < 20; i += 1) {
      clock = last - SESSION_TTL_MS / 2;
      registry.renew(session.id);
      const now = registry.list()[0]?.expiresAt ?? 0;
      expect(now).toBeLessThanOrEqual(cap);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(cap);
    clock = cap - 1;
    expect(registry.authenticate(token)?.id).toBe(session.id);
    expect(registry.renew(session.id)).toBe(false);
    clock = cap + 1;
    expect(registry.authenticate(token)).toBeNull();
  });

  it("applies the cap to a session issued long before this version", () => {
    const day = 24 * 60 * 60_000;
    const old = {
      id: "old-device", tokenHash: "0".repeat(64), label: "old laptop", scopes: ["admin"],
      createdAt: clock - 160 * day, lastSeenAt: clock - day, expiresAt: clock + 15 * day,
    };
    const older = { ...old, id: "older-device", tokenHash: "1".repeat(64), createdAt: clock - 175 * day };
    writeFileSync(file(), JSON.stringify({ version: 1, sessions: [old, older] }));
    const loaded = new SessionRegistry({ file: file(), now: () => clock });
    expect(loaded.renew("old-device")).toBe(true);
    expect(loaded.list()[0]?.expiresAt).toBe(old.createdAt + SESSION_MAX_AGE_MS);
    expect(loaded.renew("older-device")).toBe(false);
    expect(loaded.list()[1]?.expiresAt).toBe(older.expiresAt);
  });

  it("reads whole days from the environment and falls back on anything else", () => {
    const day = 24 * 60 * 60_000;
    expect(daysMs(undefined, 30)).toBe(30 * day);
    expect(daysMs("7", 30)).toBe(7 * day);
    for (const bad of ["0", "-1", "0.5", "soon", "1e308", "3651", ""]) expect(daysMs(bad, 30)).toBe(30 * day);
    expect(daysMs("3650", 30)).toBe(3650 * day);
  });

  it("gives a cookie whole seconds, never less than one", () => {
    expect(cookieMaxAgeSeconds({ expiresAt: 10_500 }, 0)).toBe(10);
    expect(cookieMaxAgeSeconds({ expiresAt: 100 }, 0)).toBe(1);
    expect(cookieMaxAgeSeconds({ expiresAt: 0 }, 5_000)).toBe(1);
  });
});

describe("stream tickets", () => {
  it("are single use, short-lived, and die with their session", () => {
    const { session } = issueSession();
    const { ticket } = registry.issueStreamTicket(session.id);
    expect(registry.redeemStreamTicket(ticket)?.id).toBe(session.id);
    expect(registry.redeemStreamTicket(ticket)).toBeNull();
    const { ticket: late } = registry.issueStreamTicket(session.id);
    clock += STREAM_TICKET_TTL_MS + 1;
    expect(registry.redeemStreamTicket(late)).toBeNull();
    const { ticket: orphan } = registry.issueStreamTicket(session.id);
    registry.revoke(session.id);
    expect(registry.redeemStreamTicket(orphan)).toBeNull();
  });
});

describe("telling the server a session opened", () => {
  it("names every session opened by account sign-in, with its scopes", () => {
    const opened: string[][] = [];
    registry.onSessionIssued((session) => opened.push(session.scopes));
    registry.issue({ label: "Test client", scopes: ["client"] });
    registry.issue({ label: "Laptop", scopes: ["admin", "client"] });
    expect(opened).toEqual([["client"], ["admin", "client"]]);
  });
});
