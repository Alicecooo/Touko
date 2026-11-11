import { useDesktopCapabilities } from "../DesktopCapabilities";

import { useStore, type Bot } from "@/state/store";
import { approvalModeFor } from "../../../shared/approval-mode";
import { connectorGrantsState, type ConnectorGrantsState } from "@/lib/connector-grants";
import { highLevelConnected, useHighLevelStatus } from "@/lib/highlevel-status";

export type BotPatch = Partial<
  Pick<
    Bot,
    | "name"
    | "title"
    | "description"
    | "soul"
    | "notifications"
    | "color"
    | "mascotExpression"
    | "avatarUrl"
    | "avatarCrop"
    | "avatarZoom"
    | "avatarFocusX"
    | "avatarFocusY"
    | "alwaysAllow"
    | "autoApprove"
    | "approvalMode"
    | "outbound"
    | "fallback"
    | "replyStyle"
    | "memoryEnabled"
    | "notifications"
    | "chiefOfStaff"
    | "managedSections"
    | "approvePeerComms"
    | "composio"
    | "browser"
    | "recordBrowserSteps"
    | "mcpServers"
    | "modelSelection"
  >
> & {
  computer?: Bot["computer"] | null;
  connectorTools?: Bot["connectorTools"] | null;
  connectorScopes?: Bot["connectorScopes"] | null;
  acknowledgeLocalAuto?: boolean;
  acknowledgePeerScope?: boolean;
};

export function useBotSettingsDerived(bot: Bot) {
  const { state, dispatch } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const patch = (p: BotPatch) => dispatch({ type: "updateBot", botId: bot.id, patch: p });
  const engine = state.instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId);
  const approvalMode = approvalModeFor(bot);
  const trustedModesAvailable = Boolean(window.ogb?.approvals && capabilities.host.packaged);
  const canCoordinate = engine?.capabilities?.agentsMcp === true;
  // Connected apps reach a bot through Composio's MCP or the native HighLevel one; either lets the switch work.
  const canUseConnectedApps = engine?.capabilities?.composioMcp === true || engine?.capabilities?.highlevelMcp === true;
  // A native HighLevel connection counts as a connected app even where the Composio service is not set up (a Cloud home).
  const highlevel = useHighLevelStatus();
  const connectedAppsConfigured = state.config?.composio?.configured === true || highLevelConnected(highlevel);
  const connectedAppsEnabled = bot.composio !== false;
  const connectorGrantState: ConnectorGrantsState = connectorGrantsState(bot);

  const sectionName = bot.section?.trim() || "General";
  const currentChief = state.bots.find(
    (candidate) =>
      candidate.chiefOfStaff &&
      (candidate.section?.trim() || "") === (bot.section?.trim() || ""),
  );
  const botRoutines = state.routines.filter((routine) => routine.botId === bot.id);
  const activeBotRoutines = botRoutines.filter((routine) => routine.enabled).length;

  return {
    patch,
    engine,
    approvalMode,
    trustedModesAvailable,
    canCoordinate,
    canUseConnectedApps,
    connectedAppsConfigured,
    connectedAppsEnabled,
    connectorGrantState,

    sectionName,
    currentChief,
    botRoutines,
    activeBotRoutines,
  };
}
