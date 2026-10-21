import { redactSecretsInText } from "../security/redact.ts";
import type { Message } from "../storage/store.ts";

export const TITLE_INPUT_MAX_CHARS = 1_500;
const EXCERPT_MAX_MESSAGES = 12;
const EXCERPT_LINE_MAX_CHARS = 300;
const ATTACHMENT_TAG = /<attached-(?:image|file)\b[^>]*\/>/g;

export type ThreadTitleSource = "first-message" | "conversation";

const TITLE_PROMPT: Record<ThreadTitleSource, { ask: string; label: string }> = {
  "first-message": { ask: "Name the conversation that begins with the message below.", label: "Message:" },
  conversation: { ask: "Name the conversation below by what it is about now.", label: "Conversation:" }};

export function threadTitlePrompt(text: string, source: ThreadTitleSource = "first-message"): string {
  const { ask, label } = TITLE_PROMPT[source];
  return [
    ask,
    "Reply with only a short title: 3 to 6 words, plain text, no quotes, no trailing period.",
    label,
    text.trim().slice(0, TITLE_INPUT_MAX_CHARS),
  ].join("\n");
}

interface ExcerptCandidate {
  label?: string;
  text: string;
}

/** Attachment markup and secrets are scrubbed before anything leaves this machine. */
function excerptLines(candidates: Iterable<ExcerptCandidate>, maxLines = Infinity): string[] {
  const lines: string[] = [];
  let length = 0;
  for (const { label, text } of candidates) {
    const clean = redactSecretsInText(text.replace(ATTACHMENT_TAG, " ")).replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const clipped = clean.length > EXCERPT_LINE_MAX_CHARS ? `${clean.slice(0, EXCERPT_LINE_MAX_CHARS - 1)}…` : clean;
    const line = label ? `${label}: ${clipped}` : clipped;
    if (length + line.length + 1 > TITLE_INPUT_MAX_CHARS) break;
    lines.push(line);
    length += line.length + 1;
    if (lines.length >= maxLines) break;
  }
  return lines;
}

export function titleConversationExcerpt(messages: readonly Message[]): string {
  function* newestFirst(): Generator<ExcerptCandidate> {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]!;
      if (message.kind !== "text" || !message.text || message.aside || message.queued) continue;
      yield { label: message.role === "user" ? "User" : "Bot", text: message.text };
    }
  }
  return excerptLines(newestFirst(), EXCERPT_MAX_MESSAGES).reverse().join("\n");
}
