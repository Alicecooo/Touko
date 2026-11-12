import { useState, type ReactNode } from "react";

import { t } from "@/lib/i18n";
import { useStore, type Bot } from "@/state/store";
import { AccessSection } from "../bot-settings/AccessSection";
import { ModelSection } from "../bot-settings/ModelSection";
import { PromptPreview } from "../bot-settings/PromptPreview";
import { RoutinesSection } from "../bot-settings/RoutinesSection";
import { SkillsSection } from "../bot-settings/SkillsSection";
import { SlackSection } from "../bot-settings/SlackSection";
import { NotificationsSection } from "../bot-settings/NotificationsSection";
import type { useBotPrompt } from "../bot-settings/useBotPrompt";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";

import type { PageId } from "./page-registry";
import { NoteRow } from "./rows";

type Derived = ReturnType<typeof useBotSettingsDerived>;

export interface PageContext {
  bot: Bot;
  derived: Derived;
  slackUrl: string | null;
  prompt: ReturnType<typeof useBotPrompt>;
  onOpen: (page: PageId) => void;
}

export const pageSurfaceCls = "flex flex-col gap-3 [&_.bg-card]:bg-ink/[0.03] [&_.rounded-xl.bg-card]:border [&_.rounded-xl.bg-card]:border-ink/[0.04]";

function PromptPage({ prompt }: Pick<PageContext, "prompt">) {
  const [open, setOpen] = useState(true);
  return <PromptPreview data={prompt.prompt} error={prompt.promptError} open={open} onToggle={() => setOpen((current) => !current)} />;
}

function FolderPage({ bot, derived }: Pick<PageContext, "bot" | "derived">) {
  return <AccessSection bot={bot} derived={derived} parts={["folder"]} />;
}

export function PageBody({ page, ...context }: PageContext & { page: PageId }): ReactNode {
  const { bot, derived, slackUrl, prompt } = context;
  const { state } = useStore();
  switch (page) {
    case "model":
      return <ModelSection bot={bot} />;
    case "always":
      return <AccessSection bot={bot} derived={derived} parts={["always"]} />;
    case "routines":
      return <RoutinesSection bot={bot} routines={derived.botRoutines} runs={state.routineRuns} />;
    case "apps":
      return <AccessSection bot={bot} derived={derived} parts={["apps"]} />;
    case "memory":
      return null;
    case "skills":
      return <SkillsSection bot={bot} />;

    case "folder":
      return <FolderPage bot={bot} derived={derived} />;
    case "notifications":
      return <NotificationsSection bot={bot} derived={derived} />;
    case "mcp":
      return <AccessSection bot={bot} derived={derived} parts={["mcp"]} />;
    case "tools":
      return <AccessSection bot={bot} derived={derived} parts={["tools"]} />;
    case "slack":
      return slackUrl ? <SlackSection managementUrl={slackUrl} /> : <NoteRow>{t("botPanel.slackUnavailable")}</NoteRow>;
    case "prompt":
      return <PromptPage prompt={prompt} />;
  }
}
