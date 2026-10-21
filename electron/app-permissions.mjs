// Only the application UI can request clipboard, notifications and guarded display capture.
const ALLOWED_APP_PERMISSIONS = new Set(["notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen"]);
function webOrigin(value) {
  if (typeof value !== "string") return null;
  try { const origin = new URL(value).origin; return origin === "null" ? null : origin; }
  catch { return null; }
}
export function appPermissionAllowed(permission, requestingUrlOrOrigin, rendererOrigin, details = {}) {
  const requesting = webOrigin(requestingUrlOrOrigin);
  const allowed = webOrigin(rendererOrigin);
  if (!requesting || !allowed || requesting !== allowed) return false;
  // Electron's guarded getDisplayMedia request has no audio or video device types.
  if (permission === "media") return details.mediaType === undefined && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 0;
  return ALLOWED_APP_PERMISSIONS.has(permission);
}
export function remoteClipboardWriteAllowed(permission, requestingUrlOrOrigin, activeRemoteOrigin, details = {}) {
  if (permission !== "clipboard-sanitized-write" || details.isMainFrame !== true) return false;
  const requesting = webOrigin(requestingUrlOrOrigin), active = webOrigin(activeRemoteOrigin);
  return Boolean(requesting && active && requesting === active);
}
export function appPermissionHandlers({ rendererOrigin, mainContents, cloudHomeOrigin = () => null, activeRemoteOrigin = () => null }) {
  const allowed = (contents, permission, requesting, details) => appPermissionAllowed(permission, requesting, rendererOrigin(), details)
    || (Boolean(contents) && contents === mainContents() && (remoteClipboardWriteAllowed(permission, requesting, activeRemoteOrigin(), details)
      || remoteClipboardWriteAllowed(permission, requesting, cloudHomeOrigin(), details)));
  return {
    request: (contents, permission, callback, details) => callback(allowed(contents, permission, details?.requestingUrl ?? contents?.getURL?.() ?? "", details)),
    check: (contents, permission, requestingOrigin, details) => allowed(contents, permission, requestingOrigin || contents?.getURL?.() || "", details),
  };
}

// Both explicit IPC links and window.open must use the same web-only policy.
export function externalWebUrl(rawUrl) {
  if (typeof rawUrl !== "string") throw new Error("A web address is required");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That web address is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only web links can be opened");
  if (url.username || url.password) throw new Error("Web links must not include user credentials");
  return url.toString();
}
