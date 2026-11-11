/**
 * Credentials an agent may ask the person to provide through an inline
 * card. The id is the entire authority surface: agents never choose a
 * config path, label, URL, or arbitrary field name.
 */
export const CREDENTIAL_TARGETS = {
  xaiApiKey: {
    label: "xAI API key",
    description: "Used by the built-in Grok provider.",
    placeholder: "xai-…",
    helpUrl: "https://console.x.ai/",
  },
  
  opencodeGoApiKey: {
    label: "OpenCode API key",
    description: "Used for OpenCode Zen and Go.",
    placeholder: "Paste your OpenCode API key",
    helpUrl: "https://opencode.ai/docs/providers/",
  },
} as const;

export type CredentialTargetId = keyof typeof CREDENTIAL_TARGETS;
export type CredentialConfig = {
  xai?: { key?: string };
  
  opencodeGo?: { apiKey?: string };
};

export function isCredentialTargetId(value: unknown): value is CredentialTargetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CREDENTIAL_TARGETS, value);
}

export function credentialConfigPatch(id: CredentialTargetId, value: string): CredentialConfig {
  switch (id) {
    case "xaiApiKey":
      return { xai: { key: value } };
    
    case "opencodeGoApiKey":
      return { opencodeGo: { apiKey: value } };
  }
}

export function credentialIsConfigured(config: CredentialConfig, id: CredentialTargetId): boolean {
  switch (id) {
    case "xaiApiKey":
      return Boolean(config.xai?.key);
    
    case "opencodeGoApiKey":
      return Boolean(config.opencodeGo?.apiKey);
  }
}

/** A still-pending credential card for this target — the set a newer
 * request supersedes. Provided, dismissed, and already-superseded cards
 * keep their settled state untouched. */
export function isPendingCredentialRequest(
  message: {
    kind?: unknown;
    secret?: { target?: unknown; provided?: unknown; dismissed?: unknown; superseded?: unknown };
    from?: { botId?: unknown };
  },
  target: CredentialTargetId,
  requestingBotId: string,
  roomThread: boolean,
): boolean {
  return (
    message.kind === "secret" &&
    message.secret?.target === target &&
    message.secret.provided !== true &&
    message.secret.dismissed !== true &&
    message.secret.superseded !== true &&
    (!roomThread || message.from?.botId === requestingBotId)
  );
}

export function credentialResumeOutcome(state: {
  provided?: unknown;
  dismissed?: unknown;
}): "provided" | "dismissed" | null {
  const provided = state.provided === true;
  const dismissed = state.dismissed === true;
  if (provided === dismissed) return null;
  return provided ? "provided" : "dismissed";
}
