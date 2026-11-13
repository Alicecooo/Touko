import { Info, RefreshCw } from "lucide-react";
import { statusActivity } from "@/lib/activity-runs";
import type { Message } from "@/state/store";
import { CancelledTurnRow } from "./CancelledTurnRow";

export function StatusActivityRow({ message }: { message: Message }) {
  const status = statusActivity(message);
  if (!status) return null;
  if (status.kind === "stopped") return <CancelledTurnRow />;
  const Icon = status.kind === "recovery" ? RefreshCw : Info;
  return (
    <div role="status" data-work-status={status.kind} className="flex w-fit max-w-full items-start gap-2 border-l-2 border-hairline/50 py-1 pl-3 text-[12px] text-ink-tertiary">
      <Icon size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{status.text}</span>
    </div>
  );
}
