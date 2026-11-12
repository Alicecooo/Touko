import { EffortRow, ModelPicker } from "../ModelPicker";
import { useStore, type Bot } from "@/state/store";
import { useBotEditor } from "./BotEditorContext";
import { ProposalStatus } from "./ProposalStatus";
import { ThreadModelsLine } from "../ThreadModelsLine";
import { t } from "@/lib/i18n";

export function ModelSection({ bot }: { bot: Bot }) {
  const { state } = useStore();
  const { draft } = useBotEditor();
  const modelVariants = state.instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId)?.capabilities?.modelVariants;
  const labelClass = "min-w-0 text-[13.5px] font-medium text-ink";
  return (
    <div className="divide-y divide-ink/[0.05] rounded-xl border border-ink/[0.04] bg-card">
      <div className="px-3.5 py-3">
        <ModelPicker
          bot={bot}
          contained
          label={<span className={labelClass}>{t("model.section.default")}</span>}
        />
        {!draft && <ThreadModelsLine bot={bot} className="mt-2" />}
        <ProposalStatus bot={bot} kind="chief" />
      </div>
      <EffortRow
        compact
        bot={bot}
        className="px-3.5 py-3"
        label={<span className={labelClass}>{t(modelVariants ? "model.simple.reasoning" : "model.section.effort")}</span>}
      />
    </div>
  );
}
