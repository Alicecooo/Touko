import { requestNotificationPermission } from "@/lib/notify";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { Switch } from "../SettingsPrimitives";
import type { useBotSettingsDerived } from "./useBotSettingsDerived";
import { useBotEditor } from "./BotEditorContext";

export function NotificationsSection({
  bot,
  derived,
}: {
  bot: Bot;
  derived: ReturnType<typeof useBotSettingsDerived>;
}) {
  const { patch } = derived;
  const { draft } = useBotEditor();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-xl bg-card p-4">
        <div>
          <div className="text-[15px] font-medium text-ink">{t("botNotifications.title")}</div>
          <div className="mt-0.5 text-[13px] text-ink-secondary">
            {t("botNotifications.help")}
          </div>
        </div>
        <Switch
          checked={bot.notifications}
          aria-label={t("botNotifications.label")}
          onClick={() => {
            const enabled = !bot.notifications;
            if (enabled && !draft) void requestNotificationPermission();
            patch({ notifications: enabled });
          }}
        />
      </div>
    </div>
  );
}
