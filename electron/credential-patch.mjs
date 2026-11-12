// What saving a credential from the desktop changes in the server config, by credential name.
export const CREDENTIAL_PATCH = {
  composioApiKey: (value) => ({ composio: { apiKey: value } }),
  xaiApiKey: (value) => ({ xai: { key: value } }),
};

/** Electron 43's ipcMain.handle sends a thrown error to the page as its toString(), so a key the provider refused travels as its name. */
export function credentialSaveError(status, body) {
  const error = new Error(body?.error || `Could not save credential (HTTP ${status})`);
  if (body?.code === "key_rejected") error.name = "KeyRejected";
  return error;
}
