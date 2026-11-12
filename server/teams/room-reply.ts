/**
 * Follows Hermes Agent's desktop group chat (MIT): the newest assistant
 * message is the reply, and an empty or "(pass)" reply is no reply.
 */
import type { WireMessage as Message } from "../../shared/wire.ts";

export function isPassText(text: string | undefined): boolean {
  const trimmed = (text ?? "").trim();
  return !trimmed || isExplicitPass(trimmed);
}

/** A chosen silence. An empty turn is not one: the model may simply have failed to speak. */
export function isExplicitPass(text: string | undefined): boolean {
  return /^\(?\s*pass\s*\)?\.?$/i.test((text ?? "").trim());
}

/**
 * A group member who passes, or who never spoke and did no work, stays silent.
 * A 1:1 still owes a reply. Tool work with no room-facing text is asked once
 * for the result, so finished work is not left unspoken.
 */
export function shouldReaskRoomSummary(
  lastText: string,
  options: { didWork: boolean; direct: boolean },
): boolean {
  const said = lastText.trim();
  if (said && !isExplicitPass(said)) return false;
  if (options.direct) return true;
  if (isExplicitPass(said)) return false;
  return options.didWork;
}

export function otherVoices(selfName: string, memberNames: readonly string[], personName: string): string[] {
  const self = selfName.trim().toLowerCase();
  const names = [...memberNames, personName]
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== self);
  return [...new Set(names)];
}

const SPEAKER_LINE = /^(?:@)?(.+?)\s*[:：]\s*([\s\S]*)$/u;

function ownLine(line: string, selfName: string, known: ReadonlySet<string>): string | null {
  const match = SPEAKER_LINE.exec(line.trim());
  if (!match) return line;
  const label = match[1]!.trim().toLowerCase();
  if (!known.has(label)) return line;
  if (label !== selfName) return null;
  const rest = match[2] ?? "";
  return rest.trim() ? rest : null;
}

/**
 * The stored words are this bot's. Lines written as another member or the
 * person are dropped; a line the bot labeled with its own name keeps the words.
 * Fenced blocks stay intact so an example is not mistaken for a second speaker.
 */
export function asOwnVoice(text: string, selfName: string, otherNames: readonly string[]): string {
  const self = selfName.trim().toLowerCase();
  const known = new Set(
    [selfName, ...otherNames].map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  let fence = "";
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    if (fence) {
      kept.push(line);
      if (line.trim().startsWith(fence)) fence = "";
      continue;
    }
    const opened = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (opened) {
      fence = opened[1]!;
      kept.push(line);
      continue;
    }
    const spoken = ownLine(line, self, known);
    if (spoken !== null) kept.push(spoken);
  }
  return kept.join("\n").trim();
}

export function roomTurnReply(texts: readonly string[]): string {
  const last = texts.at(-1)?.trim() ?? "";
  return isPassText(last) ? "" : last;
}

export function roomTurnNarrationIds(messages: readonly Message[]): Set<string> {
  const settled = new Set<string>();
  for (const message of messages) {
    if (message.role === "bot" && message.kind === "text" && message.turnId && message.turnTerminal) settled.add(message.turnId);
  }
  const narration = new Set<string>();
  for (const message of messages) {
    if (
      message.role === "bot" &&
      message.kind === "text" &&
      message.turnId &&
      !message.turnTerminal &&
      !message.attachments?.length &&
      settled.has(message.turnId)
    ) narration.add(message.id);
  }
  return narration;
}

export const ROOM_SUMMARY_REASK =
  "Your last turn in this room ended without a final message to the room. Reply now with one short message (1–3 lines): your result, or that you could not finish and why. Do not start new work.";

export function finishedWithoutSummaryLine(name: string, reasking: boolean): string {
  return reasking
    ? `${name} finished without a summary — asking for a short result`
    : `${name} finished without a summary`;
}
