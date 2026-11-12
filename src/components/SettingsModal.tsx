import { useEffect, useRef, useState } from "react";
import { Archive, Coins, KeyRound, LockKeyhole, Monitor, Palette, Plug, ScrollText, Search, Terminal, User, X, Building2, BookOpen } from "lucide-react";
import { api, useStore, type AppSettingsSection, type ConfigStatus } from "@/state/store";
import { routinesInConversationEnabled, showToolCallsEnabled, skillsLibraryEnabled } from "@/lib/feature-flags";
import { localeChoices, type LocaleKey } from "@/locales";
import { t } from "@/lib/i18n";
import { AppConnectionSettings, ModelApiSettings } from "./ConnectionSettings";
import { EnginesSettings } from "./EnginesSettings";
import { ActivitySection } from "./ActivitySection";
import { useOwnerOrAdmin } from "@/lib/use-owner-or-admin";
import { CustomDomainSettings } from "./CustomDomainSettings";

import { LoginsSettings } from "./LoginsSettings";
import { ConnectedWorkspacesSettings } from "./ConnectedWorkspacesSettings";
import { OrganizationSettings } from "./OrganizationSettings";
import { Card, SettingRow, Switch } from "./SettingsPrimitives";
import { shortcutLabel } from "./ShortcutHint";
import { UsageSection } from "./UsageSection";
import { SkillsSection } from "./SkillsSection";
import { LicenseExpiryBanner } from "./LicenseExpiryBanner";
import { WorkspacesSection, workspacesAvailable } from "./WorkspacesSection";
import { SkinPicker } from "./SkinPicker";
import { ChatWidthRow, FontRow } from "./AppearanceSelectRows";
import { setColorUserBubbles, useColorUserBubbles } from "@/lib/user-bubble-preference";
import { McpCallTimeoutSettings } from "./McpCallTimeoutSettings";
import { ThreadConcurrencySettings } from "./ThreadConcurrencySettings";
import { AutomaticRecoverySettings } from "./AutomaticRecoverySettings";
import { ThreadCleanupSettings } from "./ThreadCleanupSettings";
import { WorkspaceBackupSettings } from "./WorkspaceBackupSettings";
import { CompanyBackupSettings } from "./CompanyBackupSettings";
import { cn } from "@/lib/cn";
import { glassPopupFrameStyle } from "@/lib/glass-popup";
import { NotificationRows } from "./NotificationSettingsRows";
import { parseSidebarDensity, setPinnedCircles, setSidebarDensity, setUniversalPins, SIDEBAR_DENSITIES, usePinnedCircles, useSidebarDensity, useUniversalPins, type SidebarDensity } from "@/lib/sidebar-preferences";
import { setShowRunCard, useShowRunCard } from "@/lib/run-card-preferences";
import { parseSendKey, SEND_KEYS, sendKeyLabel, setSendKey, useSendKey } from "@/lib/send-key";
import { effectiveLanguage, setLanguageChoice, useLanguageChoice } from "@/lib/language-preference";
import { Select } from "./Select";

// labelKey, not a label: t() reads the active pack when called, so a label resolved at module scope would freeze the
// boot language.
export type SettingsGroup = "you" | "ai" | "computers" | "account";

export const SETTINGS_GROUPS: Array<{ id: SettingsGroup; labelKey: LocaleKey }> = [
  { id: "you", labelKey: "settings.group.you" },
  { id: "ai", labelKey: "settings.group.ai" },
  { id: "computers", labelKey: "settings.group.computers" },
  { id: "account", labelKey: "settings.group.account" },
];

export const SECTIONS: Array<{
  id: AppSettingsSection;
  group: SettingsGroup;
  labelKey: LocaleKey;
  icon: typeof User;
  keywords: string[];
}> = [
  { id: "general", group: "you", labelKey: "settings.section.general", icon: User, keywords: ["profile", "name", "email", "about me", "about", "suggestions", "suggested", "memory", "analytics", "updates", "effort", "new bots", "reasoning", "threads", "parallel", "concurrency", "cleanup", "retention", "event log", "event-log", "log size", "automatic recovery", "backup model", "fallback", "routines", "conversation", "schedule"] },
  { id: "appearance", group: "you", labelKey: "settings.section.appearance", icon: Palette, keywords: ["skin", "theme", "appearance", "chat width", "width", "wide", "full width", "bubble", "bubbles", "tools", "tool calls", "threads", "show threads", "hide threads", "sidebar", "density", "compact", "comfortable", "avatars", "display", "run", "this run", "run card", "commands", "notifications", "sound", "sounds", "mute", "silent", "chime", "pinned", "circles", "universal", "groups", "top", "send", "enter", "return", "shift+enter", "ctrl+enter", "cmd+enter", "⌘+enter", "new line", "keyboard", "ime", "japanese", "message color", "my messages"] },
  { id: "companion", group: "you", labelKey: "settings.section.server", icon: Monitor, keywords: ["server", "https", "domain", "dns", "self-hosted", "caddy"] },
  { id: "engines", group: "ai", labelKey: "settings.section.engines", icon: Terminal, keywords: ["models", "model providers", "engines", "claude", "codex", "grok", "providers", "cli", "sign in", "subscription"] },
  { id: "connections", group: "ai", labelKey: "settings.section.connections", icon: KeyRound, keywords: ["keys", "api", "api key", "api keys", "connections", "xai", "mistral", "cerebras", "meta", "muse", "router", "openrouter", "base url", "openai", "anthropic", "groq", "opencode", "provider"] },
  { id: "appConnections", group: "ai", labelKey: "settings.section.appConnections", icon: Plug, keywords: ["apps", "connections", "composio", "mcp", "tools", "servers", "gmail", "github", "slack", "notion", "应用", "连接", "工具", "連線", "應用"] },
  { id: "skills", group: "ai", labelKey: "settings.section.skills", icon: BookOpen, keywords: ["skills", "library", "assign", "agent skills", "skill md"] },
  { id: "desktopWorkspaces", group: "computers", labelKey: "settings.section.desktopWorkspaces", icon: Building2, keywords: ["workspace", "cloud", "hosted", "server", "servers", "connect", "pair", "switch", "local"] },
  { id: "logins", group: "computers", labelKey: "settings.section.logins", icon: LockKeyhole, keywords: ["logins", "login", "passwords", "password", "sign in", "2fa", "one-time code", "totp", "1password", "vault"] },
  { id: "organization", group: "account", labelKey: "settings.section.organization", icon: Building2, keywords: ["company", "organization", "organisation", "sign in", "enroll", "managed", "models", "disconnect"] },
  { id: "usage", group: "account", labelKey: "settings.section.usage", icon: Coins, keywords: ["tokens", "cost", "billing", "plan", "quota", "remaining", "weekly", "5-hour", "model", "used"] },
  { id: "backups", group: "account", labelKey: "settings.section.backups", icon: Archive, keywords: ["export", "import", "restore", "full backup", "password", "recovery"] },
  { id: "activity", group: "account", labelKey: "settings.section.activity", icon: ScrollText, keywords: ["activity", "audit", "log", "history", "who changed", "approvals", "decisions", "admin"] },
  { id: "workspaces", group: "account", labelKey: "settings.section.workspaces", icon: Building2, keywords: ["clients", "tenants", "fleet", "workspaces", "installation", "installations"] },
];

export function sectionMatches(section: (typeof SECTIONS)[number], query: string): boolean {
  if (!query) return true;
  return [t(section.labelKey), ...section.keywords].some((part) => part.toLowerCase().includes(query));
}

function ProfileFields() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState(state.config?.profile?.name ?? "");
  const [email, setEmail] = useState(state.config?.profile?.email ?? "");
  useEffect(() => {
    setName(state.config?.profile?.name ?? "");
    setEmail(state.config?.profile?.email ?? "");
  }, [state.config?.profile?.name, state.config?.profile?.email]);

  const save = () => {
    void fetch("/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: { name: name.trim(), email: email.trim().toLowerCase() } }),
    })
      .then((r) => { if (!r.ok) throw new Error("Profile save failed"); return r.json(); })
      .then((config: ConfigStatus) => {
        if (config.profile) dispatch({ type: "profileSaved", profile: { name: config.profile.name, email: config.profile.email } });
      })
      .catch(() => {});
  };

  const inputClass =
    "w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:outline-none";
  return (
    <div className="flex flex-col gap-3">
      <input aria-label={t("settings.profile.name")} value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder={t("settings.profile.name")} className={inputClass} />
      <input
        type="email"
        aria-label={t("phone.signIn.email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={save}
        placeholder="you@example.com"
        className={inputClass}
      />
    </div>
  );
}

function LanguageRow() {
  const { state } = useStore();
  const current = effectiveLanguage(useLanguageChoice(), state.config?.language);

  return (
    <SettingRow
      title={t("settings.language.title")}
      subtitle={t("settings.language.subtitle")}
    >
      <Select size="sm" className="w-full max-w-[240px]"
        value={current}
        aria-label={t("settings.language.aria")}
        onChange={(event) => setLanguageChoice(event.target.value)}
      >
        <option value="">{t("settings.language.system")}</option>
        {localeChoices.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </Select>
    </SettingRow>
  );
}

function SendKeyRow() {
  const sendKey = useSendKey();
  return (
    <SettingRow title={t("settings.sendKey.title")} subtitle={t("settings.sendKey.subtitle", { key: sendKeyLabel("mod-enter") })}>
      <Select size="sm" className="w-full max-w-[240px]"
        value={sendKey}
        aria-label={t("settings.sendKey.title")}
        onChange={(event) => setSendKey(parseSendKey(event.target.value))}
      >
        {SEND_KEYS.map((mode) => (
          <option key={mode} value={mode}>{sendKeyLabel(mode)}</option>
        ))}
      </Select>
    </SettingRow>
  );
}

function ColorUserBubblesRow() {
  const enabled = useColorUserBubbles();
  return (
    <SettingRow title={t("settings.userBubbles.title")} subtitle={t("settings.userBubbles.subtitle")}>
      <Switch
        checked={enabled}
        aria-label={t("settings.userBubbles.aria")}
        onClick={() => setColorUserBubbles(!enabled)}
      />
    </SettingRow>
  );
}

function PinnedCirclesRow() {
  const enabled = usePinnedCircles();
  return (
    <SettingRow title={t("settings.pinnedCircles.title")} subtitle={t("settings.pinnedCircles.subtitle")}>
      <Switch
        checked={enabled}
        aria-label={t("settings.pinnedCircles.title")}
        onClick={() => setPinnedCircles(!enabled)}
      />
    </SettingRow>
  );
}

const SIDEBAR_DENSITY_LABEL_KEYS: Record<SidebarDensity, LocaleKey> = {
  comfortable: "sidebar.density.comfortable",
  compact: "sidebar.density.compact",
  icons: "sidebar.density.iconsOnly",
};

function SidebarDensityRow() {
  const density = useSidebarDensity();
  return (
    <SettingRow title={t("sidebar.density.title")} subtitle={t("settings.sidebarDensity.subtitle")}>
      <Select size="sm" className="w-full max-w-[240px]"
        value={density}
        aria-label={t("sidebar.density.chooseAria")}
        onChange={(event) => setSidebarDensity(parseSidebarDensity(event.target.value))}
      >
        {SIDEBAR_DENSITIES.map((option) => (
          <option key={option} value={option}>{t(SIDEBAR_DENSITY_LABEL_KEYS[option])}</option>
        ))}
      </Select>
    </SettingRow>
  );
}

function RunCardRow() {
  const enabled = useShowRunCard();
  return (
    <SettingRow title={t("settings.runCard.title")} subtitle={t("settings.runCard.subtitle")}>
      <Switch
        checked={enabled}
        aria-label={t("settings.runCard.show")}
        onClick={() => setShowRunCard(!enabled)}
      />
    </SettingRow>
  );
}

function UniversalPinsRow() {
  const enabled = useUniversalPins();
  return (
    <SettingRow title={t("settings.universalPins.title")} subtitle={t("settings.universalPins.subtitle")}>
      <Switch
        checked={enabled}
        aria-label={t("settings.universalPins.title")}
        onClick={() => setUniversalPins(!enabled)}
      />
    </SettingRow>
  );
}

function RoutinesInConversationRow() {
  const { state, dispatch } = useStore();
  const enabled = routinesInConversationEnabled(state.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const config: ConfigStatus = await api("/api/config", {
        method: "PATCH",
        body: JSON.stringify({ features: { routinesInConversation: !enabled } }),
      });
      dispatch({ type: "configStatus", config });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("settings.routinesInConversation.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingRow
      title={t("settings.routinesInConversation.title")}
      subtitle={t("settings.routinesInConversation.subtitle")}
      message={error ? <p role="alert" className="text-danger">{error}</p> : null}
    >
      <Switch
        checked={enabled}
        aria-label={t("settings.routinesInConversation.aria")}
        disabled={saving}
        onClick={() => void toggle()}
        className="disabled:cursor-wait disabled:opacity-50"
      />
    </SettingRow>
  );
}

function ToolCallsRow() {
  const { state, dispatch } = useStore();
  const enabled = showToolCallsEnabled(state.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const config: ConfigStatus = await api("/api/config", {
        method: "PATCH",
        body: JSON.stringify({ features: { showToolCalls: !enabled } }),
      });
      dispatch({ type: "configStatus", config });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("settings.toolCalls.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingRow
      title={t("settings.toolCalls.title")}
      subtitle={<>{t("settings.toolCalls.subtitle")} {t("settings.toolCalls.detail")}</>}
      message={error ? <p role="alert" className="text-danger">{error}</p> : null}
    >
      <Switch
        checked={enabled}
        aria-label={t("settings.toolCalls.aria")}
        disabled={saving}
        onClick={() => void toggle()}
        className="disabled:cursor-wait disabled:opacity-50"
      />
    </SettingRow>
  );
}

/** Security: the report never holds credential values; the desktop shell does not read secret fields. */

export function SettingsModal() {
  const { state, dispatch } = useStore();
  const remoteActive = window.ogb?.remoteClient?.active === true;
  const section: AppSettingsSection =
    (remoteActive && !["appearance", "desktopWorkspaces"].includes(state.appSettingsSection)) || state.appSettingsSection === "remote" || state.appSettingsSection === "computer"
      ? "companion"
      : state.appSettingsSection;
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => window.ogb?.environments?.onOpenSettings?.(() => setQuery("")), []);
  useEffect(() => window.ogb?.onOpenAppSettings?.(() => setQuery("")), []);
  const q = query.trim().toLowerCase();
  const ownerOrAdmin = useOwnerOrAdmin();
  const baseSections = SECTIONS.filter((entry) => !remoteActive || entry.id === "companion" || entry.id === "appearance" || entry.id === "desktopWorkspaces")
    .filter((entry) => entry.id !== "desktopWorkspaces" || Boolean(window.ogb?.environments))
    .filter((entry) => entry.id !== "organization" || Boolean(window.ogb?.organization))

    .filter((entry) => entry.id !== "workspaces" || workspacesAvailable(state.config))
    .filter((entry) => entry.id !== "activity" || (!window.ogb && ownerOrAdmin === true));
  const availableSections = baseSections.filter((entry) => entry.id !== "skills" || skillsLibraryEnabled(state.config));
  const visibleSections = availableSections.filter((entry) => sectionMatches(entry, q));

  const sectionLabelKey = SECTIONS.find((entry) => entry.id === section)?.labelKey;
  const nextVisibleSection = visibleSections.some((entry) => entry.id === section) ? undefined : visibleSections[0]?.id;

  useEffect(() => {
    if (nextVisibleSection) dispatch({ type: "toggleAppSettings", open: true, section: nextVisibleSection });
  }, [dispatch, nextVisibleSection]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [section]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const search = dialog?.querySelector<HTMLInputElement>("[data-settings-search]");
    if (search?.checkVisibility()) search.focus();
    else dialog?.focus();

    const onKey = (event: KeyboardEvent) => {
      // A child editor owns Escape and its focus trap, including while saving.
      if (event.defaultPrevented || (dialog && [...dialog.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
        .some(child => child.getClientRects().length))) return;
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "toggleAppSettings", open: false });
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.checkVisibility());
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [dispatch]);

  const openSection = (id: AppSettingsSection) => dispatch({ type: "toggleAppSettings", open: true, section: id });

  const renderSection = (id: AppSettingsSection) => {
    switch (id) {
      case "desktopWorkspaces":
        return <ConnectedWorkspacesSettings />;
      case "organization":
        return window.ogb?.organization && !remoteActive ? <OrganizationSettings /> : null;

      case "general":
        return (
          <>
            <Card title={t("settings.profile.title")} subtitle={t("settings.profile.subtitle")}>
              <ProfileFields />
            </Card>

            <LanguageRow />
            <Card title={t("settings.mcpCalls.title")} subtitle={t("settings.mcpCalls.subtitle")}>
              <McpCallTimeoutSettings />
            </Card>
            <ThreadConcurrencySettings />

            {!remoteActive && <RoutinesInConversationRow />}

            <AutomaticRecoverySettings />
            <ThreadCleanupSettings />

          </>
        );
      case "appearance":
        return (
          <>
            <Card title={t("settings.skin.title")} subtitle={t("settings.skin.subtitle")}>
              <SkinPicker />
            </Card>
            <FontRow />
            <ChatWidthRow />
            <ColorUserBubblesRow />
            <SendKeyRow />
            <SidebarDensityRow />
            <PinnedCirclesRow />
            <UniversalPinsRow />
            <NotificationRows />
            {!remoteActive && <ToolCallsRow />}
            <RunCardRow />
          </>
        );
      case "connections":
        return <ModelApiSettings />;
      case "appConnections":
        return <AppConnectionSettings />;
      case "engines":
        return <EnginesSettings />;
      case "backups":
        return <><WorkspaceBackupSettings /><CompanyBackupSettings /></>;
      case "companion": return <CustomDomainSettings />;
      case "logins":
        return <LoginsSettings />;
      case "usage":
        return <UsageSection />;
      case "skills":
        return skillsLibraryEnabled(state.config) ? <SkillsSection /> : null;
      case "activity":
        return <ActivitySection />;
      case "workspaces":
        return <WorkspacesSection />;
      default:
        return null;
    }
  };

  return (
    <div
      className="glass-popup-frame"
      style={glassPopupFrameStyle()}
      onMouseDown={(e) => e.target === e.currentTarget && dispatch({ type: "toggleAppSettings", open: false })}
    >
      {/* A sibling, not the parent: a backdrop-filter on an ancestor would stop the pop-up's own glass from seeing the app behind it. */}
      <div aria-hidden="true" className="glass-scrim pointer-events-none absolute inset-0" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        tabIndex={-1}
        className="glass-surface glass-popup animate-pop-in relative flex overflow-hidden rounded-[24px] outline-none"
      >
        <span id="app-settings-title" className="sr-only">{t("settings.title")}</span>
        <nav className="glass-rail hidden min-h-0 w-[200px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline/30 p-3 sm:flex">
          <div className="shrink-0 px-2 py-3 text-[15px] font-semibold text-ink">
            {t("settings.title")}
          </div>
          <div className="mb-2 mt-1 flex min-h-8 shrink-0 items-center gap-2 rounded-lg border border-transparent bg-control/70 px-2.5 py-2 focus-within:border-focus">
            <Search size={14} className="shrink-0 text-ink-secondary" />
            <input
              data-settings-search
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.stopPropagation();
                if (query) setQuery("");
                else dispatch({ type: "toggleAppSettings", open: false });
              }}
              placeholder={t("settings.search")}
              aria-label={t("settings.searchAria")}
              className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
          </div>
          {((visibleSections.length === 0)) && (
            <div className="px-2.5 py-4 text-[12.5px] leading-relaxed text-ink-secondary">
              {t("settings.noMatch", { query: query.trim() })}
            </div>
          )}
          {SETTINGS_GROUPS.map((group) => {
            const entries = visibleSections.filter((entry) => entry.group === group.id);
            if (entries.length === 0) return null;
            return (
              <div key={group.id} role="group" aria-labelledby={`settings-group-${group.id}`} data-settings-group={group.id} className="flex flex-col gap-0.5 pb-2">
                <div id={`settings-group-${group.id}`} className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                  {t(group.labelKey)}
                </div>
                {entries.map(({ id, labelKey, icon: Icon }) => (
                  <button
                    key={id}
                    data-settings-section={id}
                    onClick={() => openSection(id)}
                    aria-current={section === id ? "page" : undefined}
                    className={cn(
                      "cursor-pointer flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors motion-reduce:transition-none",
                      section === id ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/50 hover:text-ink",
                    )}
                  >
                    <Icon size={15} className="shrink-0" />
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline/30 px-3 py-3 sm:pl-9">
            {
              <Select className="min-w-0 sm:hidden"
                aria-label={t("settings.title")}
                value={section}
                onChange={(event) => {
                  setQuery("");
                  openSection(event.target.value as AppSettingsSection);
                }}
              >
                {SETTINGS_GROUPS.map((group) => {
                  const entries = availableSections.filter((entry) => entry.group === group.id);
                  return entries.length === 0 ? null : (
                    <optgroup key={group.id} label={t(group.labelKey)}>
                      {entries.map(({ id, labelKey }) => (
                        <option key={id} value={id}>{t(labelKey)}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            }
            <span className="hidden text-[15px] font-semibold text-ink sm:block">
              {sectionLabelKey ? t(sectionLabelKey) : null}
            </span>
            <button
              onClick={() => dispatch({ type: "toggleAppSettings", open: false })}
              aria-label={t("settings.close")}
              title={`${t("settings.close")} (${shortcutLabel("close-panel")})`}
              className="ui-icon-button cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-5 sm:pb-5">
            <LicenseExpiryBanner config={state.config} />
            {
              renderSection(section)
            }
          </div>
        </div>
      </div>
    </div>
  );
}
