// Remote session credentials stay in Chromium's HttpOnly cookie jar.
const LOCAL_ID = "local";
const MAX_NAME = 60;
/** A saved server's colour: one of these names, never a value a page could style with. The renderer maps each to its skin's tone. */
const ENTRY_COLORS = Object.freeze(["blue", "teal", "purple", "orange", "red", "yellow"]);
const cleanColor = (value) => (ENTRY_COLORS.includes(value) ? value : null);

function normalizeOrigin(input) {
  if (typeof input !== "string") return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.origin;
}



function parseHostedWorkspaceLink(input) {
    if (typeof input !== "string" || !input.trim() || /[\s\\]/.test(input.trim())) return null;
    try {
      const url = new URL(input.includes("://") ? input.trim() : "https://" + input.trim());
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return null;
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
      return { origin: url.origin, url: url.origin + "/" };
    } catch { return null; }
  }

/** Remote renderers learn only their current workspace, never the local list. */
function workspaceSummary(state) {
  const active = activeEnvironment(state);
  if (!active) return { local: true, name: "This computer" };
  if (active.kind === "local") return { local: true, name: active.name, localPath: active.dataDir, missing: active.missing === true };
  return { local: false, name: active.name, origin: active.origin, ...(cleanColor(active.color) ? { color: active.color } : {}) };
}

/** Native identity must not depend on a hosted renderer's version/title. */
function workspaceWindowTitle(state) {
  const active = activeEnvironment(state);
  return active && active.kind !== "local" ? `Touko · ${active.name} (${new URL(active.origin).host})` : "Touko";
}

/** Switching is a main-process action; a cloud page must not navigate itself onto the local bridge. */
function workspaceNavigationAllowed(url, state, localOrigin) {
  try {
    return new URL(url).origin === (activeEnvironment(state)?.origin ?? localOrigin);
  } catch {
    return false;
  }
}

/** Only the main window's main frame; being embedded in a saved server grants no host authority. */
function workspaceSenderAllowed(event, contents, state, localOrigin) {
  if (!contents || event?.sender !== contents || event?.senderFrame !== contents.mainFrame) return false;
  try {
    return workspaceNavigationAllowed(event.senderFrame.url, state, localOrigin);
  } catch {
    return false;
  }
}

function serverMenuLabels(locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  const traditional = /^zh-(?:tw|hk|mo|hant)/i.test(locale);
  if (traditional) return {
    server: "伺服器", local: "這台電腦", connect: "連接自建伺服器…", forget: "移除伺服器記錄",
    forgetNamed: (name) => `移除「${name}」的記錄…`,
  };
  if (/^zh/i.test(locale)) return {
    server: "服务器", local: "这台电脑", connect: "连接自建服务器…", forget: "移除服务器记录",
    forgetNamed: (name) => `移除“${name}”的记录…`,
  };
  return {
    server: "Server", local: "This computer", connect: "Connect to a self-hosted server…", forget: "Forget server",
    forgetNamed: (name) => `Forget “${name}”…`,
  };
}

/** Native menu choices, never renderer-supplied destinations or callbacks. */
function workspaceMenuTemplate(state, { onSwitch, onConnect, onForget, labels = serverMenuLabels(), sublabels = {}, iconFor = null }) {
  const active = activeEnvironment(state);
  return [
    { id: "workspace-local", label: labels.local, type: "radio", checked: !active, click: () => onSwitch(LOCAL_ID) },
    ...state.environments.map((entry) => {
      const icon = iconFor && cleanColor(entry.color) ? iconFor(entry.color) : null;
      return {
        id: `workspace-${entry.id}`, label: entry.name, sublabel: Object.hasOwn(sublabels, entry.id) ? sublabels[entry.id] : entry.kind === "local" ? entry.dataDir : new URL(entry.origin).host,
        ...(icon ? { icon } : {}), type: "radio", checked: entry.id === state.activeId, click: () => onSwitch(entry.id),
      };
    }),
    { type: "separator" },
    { id: "workspace-connect", label: labels.connect, click: onConnect },
    ...(active ? [{ id: "workspace-forget", label: labels.forgetNamed(active.name), click: () => onForget(active.id) }] : []),
  ];
}

function cleanName(value, fallback) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME) : "";
  return name || fallback;
}

function nameFromOrigin(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** Absolute or nothing, by pattern (POSIX, drive, UNC): a path module would resolve against this app's cwd and platform. */
function cleanDataDir(value) {
  if (typeof value !== "string") return null;
  const dir = value.trim();
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(dir) ? dir : null;
}

function dirBasename(dir) {
  const parts = pathKey(dir).replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || dir;
}

/** Windows-shaped paths compare slash-normalized and case-insensitively, as Windows does; POSIX as written. */
function pathKey(dir) {
  let d = String(dir).replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(d) || d.startsWith("//")) d = d.toLowerCase();
  return d;
}

/** Comparisons run on trailing-`/` paths so `/a/b` never matches `/a/bc`. */
function asDirPrefix(dir) {
  const d = pathKey(dir);
  return d.endsWith("/") ? d : `${d}/`;
}

function cleanId(entry) {
  return typeof entry?.id === "string" && /^[\w-]{1,64}$/.test(entry.id) && entry.id !== LOCAL_ID ? entry.id : null;
}

function parseEnvironments(raw) {
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { environments: [], activeId: LOCAL_ID };
  }
  const version = value?.version ?? 1;
  if (version !== 1 && version !== 2) return { environments: [], activeId: LOCAL_ID };
  const list = Array.isArray(value?.environments) ? value.environments : [];
  const seen = new Set();
  const environments = [];
  for (const entry of list) {
    const id = cleanId(entry);
    if (!id || seen.has(id)) continue;
    const dataDir = cleanDataDir(entry?.dataDir);
    if (entry?.kind === "local") {
      // The same normalized key withLocalEnvironment uses, so one folder never gets two owners.
      const dirKey = dataDir ? `dir:${asDirPrefix(dataDir)}` : null;
      if (!dataDir || seen.has(dirKey)) continue;
      seen.add(id);
      seen.add(dirKey);
      environments.push({ id, kind: "local", name: cleanName(entry.name, dirBasename(dataDir)), dataDir });
      continue;
    }
    const origin = normalizeOrigin(entry?.origin);
    if (!origin || (entry?.kind !== undefined && entry.kind !== "remote") || seen.has(origin)) continue;
    seen.add(id);
    seen.add(origin);
    const color = cleanColor(entry?.color);
    environments.push({ id, kind: "remote", name: cleanName(entry?.name, nameFromOrigin(origin)), origin, ...(entry?.microphone === true ? { microphone: true } : {}),
      ...(color ? { color } : {}), ...(entry?.home === true ? { home: true } : {}) });
  }
  const activeId = typeof value?.activeId === "string" && environments.some((e) => e.id === value.activeId) ? value.activeId : LOCAL_ID;
  return { environments, activeId };
}

function serializeEnvironments(state) {
  return JSON.stringify({ version: 2, environments: state.environments, activeId: state.activeId }, null, 2) + "\n";
}

function withEnvironment(state, input, makeId) {
  const origin = normalizeOrigin(input?.origin);
  if (!origin) return state;
  const existing = state.environments.find((e) => e.origin === origin);
  if (existing) {
    const name = cleanName(input?.name, existing.name);
    const environments = state.environments.map((e) => (e === existing ? { ...e, kind: "remote", name } : e));
    return { ...state, environments };
  }
  const id = makeId();
  const environments = [...state.environments, { id, kind: "remote", name: cleanName(input?.name, nameFromOrigin(origin)), origin }];
  return { ...state, environments };
}

/** A saved server's name and colour, as its owner chose them (the Cloud's own setup); an invalid colour is left as it was. */
function withEnvironmentLook(state, origin, { name, color } = {}) {
  const key = normalizeOrigin(origin);
  const existing = key ? state.environments.find((e) => e.origin === key) : null;
  if (!existing) return state;
  const next = { ...existing, name: cleanName(name, existing.name), ...(cleanColor(color) ? { color } : {}) };
  if (next.name === existing.name && next.color === existing.color) return state;
  return { ...state, environments: state.environments.map((e) => (e === existing ? next : e)) };
}

function withLocalEnvironment(state, input, makeId, defaultDir) {
  const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > MAX_NAME) return { ok: false, error: "name" };
  const dataDir = cleanDataDir(input?.dataDir);
  if (!dataDir) return { ok: false, error: "path" };
  const candidate = asDirPrefix(dataDir);
  const locals = state.environments.filter((e) => e.kind === "local");
  if (locals.some((e) => asDirPrefix(e.dataDir) === candidate)) return { ok: false, error: "duplicate" };
  const insideKnown = (dir) => candidate.startsWith(asDirPrefix(dir));
  const containsKnown = (dir) => asDirPrefix(dir).startsWith(candidate);
  if (locals.some((e) => insideKnown(e.dataDir) || containsKnown(e.dataDir))) return { ok: false, error: "nested" };
  if (typeof defaultDir === "string" && defaultDir && insideKnown(defaultDir)) return { ok: false, error: "nested" };
  const environments = [...state.environments, { id: makeId(), kind: "local", name, dataDir }];
  return { ok: true, state: { ...state, environments } };
}

function activeLocalDataDir(state, _defaultDir) {
  const active = activeEnvironment(state);
  return active?.kind === "local" && typeof active.dataDir === "string" ? active.dataDir : null;
}

function startupEnvironmentDir(state, defaultDir) {
  return activeLocalDataDir(state, defaultDir) ?? defaultDir;
}

/** A named environment whose folder is missing is never leased or created: boot on the default dir and flag it. */
function bootEnvironmentDir(state, defaultDir) {
  const active = activeEnvironment(state);
  if (active?.kind === "local" && typeof active.dataDir === "string" && active.missing === true) {
    return { dataDir: defaultDir, fellBack: true, missingDir: active.dataDir };
  }
  return { dataDir: startupEnvironmentDir(state, defaultDir), fellBack: false, missingDir: null };
}

function withoutEnvironment(state, id) {
  const environments = state.environments.filter((e) => e.id !== id);
  return { environments, activeId: state.activeId === id ? LOCAL_ID : state.activeId };
}

function withMicrophone(state, id) {
  if (!state.environments.some((e) => e.id === id)) return state;
  return { ...state, environments: state.environments.map((e) => (e.id === id ? { ...e, microphone: true } : e)) };
}

function withActive(state, id) {
  if (id !== LOCAL_ID && !state.environments.some((e) => e.id === id)) return state;
  return { ...state, activeId: id };
}

function activeEnvironment(state) {
  return state.environments.find((e) => e.id === state.activeId) ?? null;
}

/** Null for "This computer" and named local environments: branch on this, not activeEnvironment, for "a remote is on screen". */
function activeRemote(state) {
  const active = activeEnvironment(state);
  return active && active.kind !== "local" ? active : null;
}

function allowedOrigins(state, localOrigin) {
  return new Set([localOrigin, ...state.environments.map((e) => e.origin).filter(Boolean)]);
}

module.exports = {
  ENTRY_COLORS,
  LOCAL_ID,
  activeEnvironment,
  activeLocalDataDir,
  activeRemote,
  allowedOrigins,
  bootEnvironmentDir,
  normalizeOrigin,
  parseEnvironments,

  parseHostedWorkspaceLink,
  serializeEnvironments,
  startupEnvironmentDir,
  withActive,
  withEnvironment,
  withEnvironmentLook,
  withLocalEnvironment,
  withMicrophone,
  withoutEnvironment,
  serverMenuLabels,
  workspaceMenuTemplate,
  workspaceNavigationAllowed,
  workspaceSenderAllowed,
  workspaceSummary,
  workspaceWindowTitle,
};
