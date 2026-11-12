import { useState } from "react";
import { Gauge } from "lucide-react";

import { threadContextWarning } from "@/lib/context-warning";
import { t } from "@/lib/i18n";
import { api, useStore, type Bot, type Message } from "@/state/store";

const pill = "flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[12.5px] text-ink";
const action = "rounded-full px-1.5 font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline";

function useCompact() {
  const { dispatch } = useStore();
  const [pending, setPending] = useState(false);
  const run = (path: string, body: unknown) => {
    if (pending) return;
    setPending(true);
    void api(path, { method: "POST", body: JSON.stringify(body) })
      .catch((cause) => dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }))
      .finally(() => setPending(false));
  };
  return { pending, run };
}
export function ThreadContextWarningView({ name, percent, busy, pending, onCompact }: {
  name: string; percent: number; busy: boolean; pending: boolean; onCompact: () => void;
}) {
  return (
    <span role="status" data-testid="context-warning" className={pill}
      title={t("contextWarning.threadHint", { name, percent })}>
      <Gauge size={13} className="shrink-0 text-warning" aria-hidden="true" />
      <span className="tabular-nums">{t("contextWarning.short", { percent })}</span>
      <button type="button" className={action} disabled={busy || pending} onClick={onCompact}
        title={busy ? t("contextWarning.busy") : undefined}>
        {pending ? t("contextWarning.compacting") : t("contextWarning.compactNow")}
      </button>
    </span>
  );
}

export function ThreadContextWarning({ bot, messages }: { bot: Bot; messages: readonly Message[] }) {
  const usage = bot.tasks?.find((task) => task.threadId === bot.threadId)?.usage;
  const warning = threadContextWarning(usage, messages);
  const { pending, run } = useCompact();
  if (!warning) return null;
  return (
    <ThreadContextWarningView name={bot.name} percent={warning.percent} busy={Boolean(bot.busy)} pending={pending}
      onCompact={() => run(`/api/bots/${bot.id}/compact`, { threadId: bot.threadId })} />
  );
}

