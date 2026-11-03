import { Folder, Table } from "lucide-react";

import { writeComputerPanelView, type ComputerPanelView } from "@/lib/computer-panel-view";
import { t } from "@/lib/i18n";
import { shortPath } from "@/lib/short-path";
import { useStore, type Bot } from "@/state/store";
import { useDesktopCapabilities } from "../DesktopCapabilities";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import type { PageId } from "./page-registry";
import { Card, NavRow } from "./rows";

type Derived = ReturnType<typeof useBotSettingsDerived>;

export function useOpenComputer(bot: Pick<Bot, "id">) {
  const { dispatch } = useStore();
  return (view: ComputerPanelView) => {
    writeComputerPanelView(bot.id, view);
    dispatch({ type: "toggleSettings", open: false });
    dispatch({ type: "toggleComputer", open: true });
  };
}

export function ComputerTab({ bot, onOpen }: { bot: Bot; derived: Derived; onOpen: (page: PageId) => void }) {
  const { capabilities } = useDesktopCapabilities();
  const openComputer = useOpenComputer(bot);
  const home = capabilities.host?.homeDir;

  return (
    <div data-panel-tabpanel="computer">
      <Card label={t("botPanel.onThisComputer")} anchor="on-computer">

        <NavRow
          data-panel-page="folder"
          icon={Folder}
          title={t("computer.files.folder")}
          hint={bot.cwd ? shortPath(bot.cwd, home) : t("computer.files.privateFolder", { name: bot.name })}
          onClick={() => onOpen("folder")}
        />
        <NavRow
          data-panel-row="data"
          icon={Table}
          title={t("computer.tab.data")}
          hint={t("botPanel.dataHint")}
          drill={false}
          onClick={() => openComputer("data")}
        />
      </Card>
    </div>
  );
}
