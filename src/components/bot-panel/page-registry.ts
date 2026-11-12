import type { LocaleKey } from "@/locales";
import type { BotSettingsSection } from "@/state/store";

export const PANEL_TABS = ["details", "library", "settings"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export const TAB_LABEL: Record<PanelTab, LocaleKey> = {
  details: "botSettings.simple.details",
  library: "botSettings.simple.library",
  settings: "settings.title",
};

export type PageId =
  | "model" | "always" | "routines" | "apps"
  | "memory" | "skills"
  | "folder"
  | "notifications" | "mcp" | "tools" | "slack"
  | "prompt";

export interface PageMeta {
  title: LocaleKey;
  home: PanelTab;
  where: LocaleKey;
  keywords: string;
}

export const PAGES: Record<PageId, PageMeta> = {
  model: { title: "model.simple.model", home: "details", where: "botPanel.where.model", keywords: "engine provider effort reasoning default model" },
  routines: { title: "botSettings.simple.routines", home: "details", where: "botPanel.where.routines", keywords: "schedule routines cron tasks run logs" },
  apps: { title: "botPanel.page.apps", home: "details", where: "botPanel.where.apps", keywords: "composio connected apps per-app tools grants gmail calendar read write limit vault" },
  memory: { title: "botSettings.simple.memory", home: "library", where: "botPanel.where.memories", keywords: "memory notes remember obsidian upkeep tidy topic daily logs undo" },
  skills: { title: "botSettings.simple.skills", home: "library", where: "botPanel.where.skills", keywords: "skills import command learned procedures organization library teach" },
  folder: { title: "botAccess.folder.title", home: "settings", where: "settings.title", keywords: "working folder directory cwd files" },
  notifications: { title: "notifications.title", home: "settings", where: "botPanel.where.profile", keywords: "alerts notifications" },
  mcp: { title: "connectors.tab.mcp", home: "settings", where: "botPanel.where.tools", keywords: "mcp servers plugins" },
  tools: { title: "botAccess.tools.title", home: "settings", where: "botPanel.where.tools", keywords: "tool selection allow exclude native tools" },
  always: { title: "botPanel.page.always", home: "settings", where: "botPanel.where.tools", keywords: "always allowed grants tools" },
  slack: { title: "botPanel.page.slack", home: "settings", where: "botPanel.where.sharing", keywords: "slack slack app admin direct messages mentions" },
  prompt: { title: "botPanel.page.prompt", home: "settings", where: "botPanel.where.activity", keywords: "prompt preview what the model sees tokens bytes context" },
};

export const PAGE_IDS = Object.keys(PAGES) as PageId[];

export interface PanelTarget {
  tab: PanelTab;
  page?: PageId;
  anchor?: string;
}

const SECTION_TARGET: Record<BotSettingsSection, PanelTarget> = {
  identity: { tab: "details" },
  slack: { tab: "settings", page: "slack" },
  skills: { tab: "library", page: "skills" },
  memory: { tab: "library", page: "memory" },
  routines: { tab: "details", page: "routines" },
  access: { tab: "settings", page: "folder" },
  model: { tab: "details", page: "model" },
  permissions: { tab: "details", anchor: "approval" },
  notifications: { tab: "settings", page: "notifications" },
  usage: { tab: "settings", anchor: "activity" },
};

export function sectionTarget(section: BotSettingsSection): PanelTarget {
  return SECTION_TARGET[section];
}

