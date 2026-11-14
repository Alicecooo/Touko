const LEGACY_WORKSPACE_CREDENTIALS = [{ section: "xai", field: "key", name: "xaiApiKey" }];

/** Moves plaintext secrets into the store and deletes the field. "" never drops a stored secret: every packaged
 * credential save writes an empty tombstone to config.json. The caller persists credentials before config. */
export function migrateWorkspaceCredentials(config, credentials) {
  const nextConfig = structuredClone(config ?? {});
  const nextCredentials = { ...credentials };
  let configChanged = false;
  let credentialsChanged = false;
  for (const field of ["tts", "live", "imageGen"]) {
    if (Object.hasOwn(nextConfig, field)) {
      delete nextConfig[field];
      configChanged = true;
    }
  }
  for (const name of ["ttsKey", "fishAudioKey", "openaiLiveKey", "openaiImageApiKey", "customImageApiKey"]) {
    if (Object.hasOwn(nextCredentials, name)) {
      delete nextCredentials[name];
      credentialsChanged = true;
    }
  }
  for (const { section, field, name } of LEGACY_WORKSPACE_CREDENTIALS) {
    const home = nextConfig?.[section];
    if (!home || typeof home !== "object" || Array.isArray(home)) continue;
    if (!Object.hasOwn(home, field)) continue;
    const value = home[field];
    if (typeof value !== "string") continue;
    const secret = value.trim();
    if (secret && nextCredentials[name] !== secret) {
      nextCredentials[name] = secret;
      credentialsChanged = true;
    }
    delete home[field];
    configChanged = true;
  }
  return { config: nextConfig, credentials: nextCredentials, configChanged, credentialsChanged };
}
