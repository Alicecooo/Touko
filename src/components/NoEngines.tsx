import { Terminal } from "lucide-react";
import { useStore } from "@/state/store";
import { t } from "@/lib/i18n";

export function NoEngines() {
  const { dispatch } = useStore();
  return <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-app p-8 text-ink">
    <Terminal size={32} /><h1 className="text-xl font-medium">{t("settings.section.engines")}</h1>
    <p className="max-w-md text-center text-sm text-ink-secondary">{t("ui.bot.setup")}</p>
    <button className="rounded-lg bg-accent px-4 py-2 text-accent-ink" onClick={() => dispatch({ type: "toggleAppSettings", open: true, section: "engines" })}>{t("settings.section.engines")}</button>
  </main>;
}
