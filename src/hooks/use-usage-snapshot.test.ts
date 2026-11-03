// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, InstanceInfo } from "@/state/store";

const fixture = vi.hoisted(() => ({ owner: true as boolean | null, track: vi.fn(), api: vi.fn(), connectedApps: vi.fn() }));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => fixture.owner }));
vi.mock("@/lib/analytics", () => ({ track: fixture.track, analyticsEnabled: () => true }));
vi.mock("@/components/PluginsPanel", () => ({ preloadConnectedApps: fixture.connectedApps }));
vi.mock("@/state/store", async (original) => ({ ...await original<typeof import("@/state/store")>(), api: fixture.api }));

const LATE_EVENING = Date.parse("2026-10-15T22:30:00.000Z");
const HOUR = 60 * 60 * 1_000;

const storage = new Map<string, string>();
let store: typeof import("@/state/store");
let hook: typeof import("./use-usage-snapshot");
let root: Root;

function ready(patch: Partial<AppState> = {}): AppState {
  return {
    ...store.initialState,
    connected: true,
    hydrated: true,
    routinesLoadState: "ready",
    config: { composio: { configured: false }, box: { configured: false }, rooms: { turnTimeoutMinutes: 30 } },
    instances: [{ instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", snapshot: { state: "available", authenticated: true }, models: { default: "", options: [] } } as InstanceInfo],
    webhookIngress: { available: true, baseUrl: "http://127.0.0.1:8800" },
    ...patch,
  };
}

function Probe() {
  hook.useUsageSnapshot();
  return null;
}

async function draw(state: AppState) {
  const value = { state, dispatch: vi.fn(), flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {} };
  await act(async () => root.render(createElement(store.BotEditorStore, { value, children: createElement(Probe) })));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const sent = () => fixture.track.mock.calls.filter(([event]) => event === "app_snapshot");

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(LATE_EVENING);
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  fixture.owner = true;
  fixture.track.mockReset();
  fixture.api.mockReset().mockResolvedValue({ sessions: [], current: null });
  fixture.connectedApps.mockReset().mockResolvedValue({ services: {}, authoritative: true });
  vi.resetModules();
  store = await import("@/state/store");
  hook = await import("./use-usage-snapshot");
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useUsageSnapshot", () => {
  it("sends one snapshot once the app is ready and the viewer owns it", async () => {
    await draw(ready());
    expect(sent()).toHaveLength(1);
    expect(sent()[0]![1]).toMatchObject({ bots: 0, engines: ["claude"], platform: "browser", remote_client: false });
  });

  it("still sends one through re-renders and readiness that comes and goes", async () => {
    await draw(ready());
    await draw(ready({ bots: [] }));
    await draw(ready({ connected: false }));
    await draw(ready());
    await wait(30 * 60 * 1_000);
    expect(sent()).toHaveLength(1);
  });

  it("sends nothing when the app is opened again the same UTC day", async () => {
    await draw(ready());
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    await draw(ready());
    expect(sent()).toHaveLength(1);
  });

  it("sends one more from the hourly check once the UTC day turns", async () => {
    await draw(ready());
    await wait(HOUR);
    expect(sent()).toHaveLength(1);
    await wait(HOUR);
    expect(sent()).toHaveLength(2);
    await wait(3 * HOUR);
    expect(sent()).toHaveLength(2);
  });

  it.each([false, null])("sends nothing and asks nothing for a viewer who is not the owner or an admin (%s)", async (owner) => {
    fixture.owner = owner;
    await draw(ready());
    await wait(26 * HOUR);
    expect(fixture.track).not.toHaveBeenCalled();
    expect(fixture.api).not.toHaveBeenCalled();
    expect(fixture.connectedApps).not.toHaveBeenCalled();
  });

  it("waits for the config, the routines, the webhooks and the engine list", async () => {
    for (const early of [ready({ config: null }), ready({ instances: [] }), ready({ routinesLoadState: "loading" }), ready({ hydrated: undefined }), ready({ webhookIngress: null })]) {
      await draw(early);
      expect(fixture.track).not.toHaveBeenCalled();
      expect(fixture.api).not.toHaveBeenCalled();
    }
    await draw(ready());
    expect(sent()).toHaveLength(1);
  });
});

describe("what the snapshot asks this page's app", () => {
  it("asks nothing of the desktop app as a remote client, and does not wait for webhooks it never loads", async () => {
    vi.stubGlobal("ogb", { remoteClient: { active: true } });
    await draw(ready({ webhookIngress: null }));
    expect(sent()[0]![1]).toMatchObject({ remote_client: true });
    expect(sent()[0]![1]).not.toHaveProperty("webhooks");
  });

  it("asks nothing in a plain browser", async () => {
    await draw(ready({ config: ready().config }));
    expect(sent()[0]![1]).toMatchObject({ platform: "browser" });
  });
});
