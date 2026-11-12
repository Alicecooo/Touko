import { Pause, Pencil, Play, Trash2, X } from "lucide-react";

import { automationStatus, runLine, type Automation } from "@/lib/automations";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useAutomationActions } from "./actions";
import { FixButton, StatusMark } from "./parts";

const RECENT = 5;
const BUTTON = "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium disabled:opacity-50";

/** One automation, simply: its sentence, its status, the last five runs, and what can be done to it. */
export function AutomationPanel({ automation, sentence, onClose, onEdit, onDeleted }: {
  automation: Automation;
  sentence: string;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const actions = useAutomationActions();
  const status = automationStatus(automation);
  const statusWord = t(status.state === "paused" ? "automations.status.paused" : status.state === "needs-you" ? "automations.status.needsYou" : "automations.status.working");

  return (
    <aside aria-label={t("automations.panel.label")} className="flex h-full w-[min(380px,100vw)] shrink-0 flex-col border-l border-hairline/40 bg-panel">
      <div className="flex items-start gap-3 border-b border-hairline/40 px-5 py-4">
        <h2 className="min-w-0 flex-1 text-[16px] font-semibold leading-snug text-ink">{sentence}</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-secondary hover:bg-raised hover:text-ink" aria-label={t("automations.panel.close")}><X size={16} /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px]" data-automation-status={status.state}>
          <StatusMark status={status} />
          <span className={cn("font-medium", status.state === "needs-you" ? "text-warning" : "text-ink")}>{statusWord}</span>
          {status.reason && <span className="min-w-0 text-ink-secondary">{status.reason}</span>}
          <FixButton automation={automation} status={status} actions={actions} onEdit={onEdit} />
        </div>


        <section>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-tertiary">{t("automations.panel.recent")}</h3>
          {automation.runs.length === 0
            ? <p className="text-[12.5px] text-ink-secondary">{t("automations.panel.noRuns")}</p>
            : <ul className="space-y-1">{automation.runs.slice(0, RECENT).map((run) => {
              const line = runLine(run);
              return (
                <li key={run.id}>
                  <button type="button" disabled={!run.threadId} onClick={() => actions.openRun(automation, run)} title={run.threadId ? t("automations.panel.open") : undefined}
                    className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-raised disabled:hover:bg-transparent">
                    <span className="shrink-0 text-ink-secondary">{line.when}</span>
                    <span className={cn("shrink-0 font-semibold", line.mark === "✓" ? "text-success" : line.mark === "✗" ? "text-danger" : "text-warning")}>{line.mark}</span>
                    <span className="min-w-0 truncate text-ink">{line.text}</span>
                  </button>
                </li>
              );
            })}</ul>}
        </section>
        {actions.error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{actions.error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-hairline/40 px-5 py-3.5">
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => void actions.runNow(automation)} className={cn(BUTTON, "bg-accent text-accent-ink hover:brightness-110")}><Play size={14} />{actions.busy === `run:${automation.id}` ? t("automations.starting") : t("automations.runNow")}</button>
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => actions.toggle(automation)} className={cn(BUTTON, "border border-hairline/50 bg-control text-ink hover:bg-raised-hover")}>{automation.enabled ? <Pause size={14} /> : <Play size={14} />}{automation.enabled ? t("automations.pause") : t("automations.resume")}</button>
        <button type="button" onClick={onEdit} className={cn(BUTTON, "text-ink hover:bg-raised")}><Pencil size={14} />{t("automations.edit")}</button>
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => void actions.remove(automation, t("automations.deleteConfirm", { sentence })).then((gone) => { if (gone) onDeleted(); })} className={cn(BUTTON, "text-danger hover:bg-danger/10")}><Trash2 size={14} />{t("automations.delete")}</button>
      </div>
    </aside>
  );
}
