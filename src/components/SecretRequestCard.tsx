import { KeyRound } from "lucide-react";

import type { Message } from "@/state/store";
import { AskSettledLine } from "./AskCard";

/** Older transcripts can contain credential cards. Keep them visible without an entry path. */
export function SecretRequestCard({ message }: { botId: string; threadId: string; message: Message }) {
  const secret = message.secret;
  if (!secret) return null;

  return (
    <AskSettledLine icon={<KeyRound size={13} />} ariaLabel={secret.label}>
      <span className="text-ink-secondary">{secret.label}</span>
    </AskSettledLine>
  );
}
