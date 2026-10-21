import { useEffect, useRef } from "react";
import { preloadConnectedApps } from "@/components/PluginsPanel";

import { useOwnerOrAdmin } from "@/lib/use-owner-or-admin";
import { sendDailySnapshot, SNAPSHOT_CHECK_MS, snapshotReady, type UsageSources } from "@/lib/usage-snapshot";
import { api, useStore } from "@/state/store";

function browserSources(): UsageSources { return { request: path => api(path), connectedApps: () => preloadConnectedApps(), platform: navigator.userAgent.includes("Electron") ? "desktop" : "browser", remoteClient: window.ogb?.remoteClient?.active === true }; }

/** The owner's daily usage snapshot: checked once the app is ready, then hourly, and sent at most once per UTC day. */
export function useUsageSnapshot(): void {
  const { state } = useStore();
  const owner = useOwnerOrAdmin();
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  const ready = owner === true && snapshotReady(state, window.ogb?.remoteClient?.active !== true);
  useEffect(() => {
    if (!ready) return;
    const check = () => void sendDailySnapshot(latest.current, browserSources());
    check();
    const timer = setInterval(check, SNAPSHOT_CHECK_MS);
    return () => clearInterval(timer);
  }, [ready]);
}
