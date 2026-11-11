/** Versioned, bundled portraits. These use the same image route as uploaded avatars. */
export const PORTRAIT_CHARACTERS = ["nocturne", "ember", "sage"] as const;
export const PORTRAIT_EXPRESSIONS = ["idle", "happy", "shy", "thinking", "working", "sleeping"] as const;
export type PortraitCharacter = (typeof PORTRAIT_CHARACTERS)[number];
export type PortraitExpression = (typeof PORTRAIT_EXPRESSIONS)[number];

export function portraitAssetName(character: PortraitCharacter, expression: PortraitExpression = "idle"): string {
  return `touko-portrait-v1-${character}-${expression}.png`;
}

export function portraitAvatarUrl(character: PortraitCharacter, expression: PortraitExpression = "idle"): string {
  return `/api/attachments/${portraitAssetName(character, expression)}`;
}

export function parsePortraitAssetName(name: string): { character: PortraitCharacter; expression: PortraitExpression } | null {
  for (const character of PORTRAIT_CHARACTERS) {
    for (const expression of PORTRAIT_EXPRESSIONS) {
      if (name === portraitAssetName(character, expression)) return { character, expression };
    }
  }
  return null;
}

export function portraitFromAvatarUrl(url: string | null | undefined) {
  const prefix = "/api/attachments/";
  return url?.startsWith(prefix) ? parsePortraitAssetName(url.slice(prefix.length)) : null;
}

/** Keep a bot's default character stable without rewriting existing profiles. */
export function defaultPortraitCharacter(seed: string): PortraitCharacter {
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) >>> 0;
  return PORTRAIT_CHARACTERS[hash % PORTRAIT_CHARACTERS.length]!;
}

export function portraitExpressionForState(state: string | null | undefined): PortraitExpression {
  if (state === "shy") return "shy";
  if (["happy", "friendly", "excited", "celebrate", "laughing", "proud", "playful", "mischievous", "notifying"].includes(state ?? "")) return "happy";
  if (["thinking", "searching", "curious", "confused", "suspicious", "skeptical", "worried", "scared", "sad", "angry", "alerting", "surprised"].includes(state ?? "")) return "thinking";
  if (["working", "focused", "loading", "writing", "sending", "receiving", "uploading", "humming", "dictating", "progress", "orbit", "radar"].includes(state ?? "")) return "working";
  if (["sleeping", "sleepy", "drowsy", "bored", "powering-down"].includes(state ?? "")) return "sleeping";
  return "idle";
}
