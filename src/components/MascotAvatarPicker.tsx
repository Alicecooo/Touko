import type { Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { MAUS_COLORS, MAUS_COLOR_NAMES, normalizeState, type MausState } from "@/lib/mascot";
import { portraitFromAvatarUrl } from "../../shared/portrait-avatars";
import { botMascotBody, MASCOT_BODY_IDS } from "../../shared/mascot-bodies";
import { MausAvatar } from "./Avatar";
import type { AvatarPatch } from "./avatar-editing";

const EXPRESSIONS = ["idle", "happy", "shy", "thinking", "working", "sleeping"] as const satisfies readonly MausState[];

export function MascotAvatarPicker({ bot, disabled, onPatch }: {
  bot: Bot;
  disabled: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const pinned = normalizeState(bot.mascotExpression);
  const bodyId = botMascotBody(bot.mascotBody);
  const selected = !bot.avatarUrl || Boolean(portraitFromAvatarUrl(bot.avatarUrl));
  const choose = (patch: AvatarPatch) => onPatch({
    avatarUrl: null,
    avatarCrop: "rounded", avatarZoom: 1, avatarFocusX: 0.5, avatarFocusY: 0.5,
    ...patch,
  });

  return <div data-mascot-picker>
    <div className="mb-2 text-[12px] font-medium text-ink-secondary">{t("portrait.colors")}</div>
    <div className="flex flex-wrap gap-2.5" role="group" aria-label={t("portrait.colors")}>
      {MAUS_COLOR_NAMES.map(color => <button key={color} type="button" disabled={disabled}
        data-avatar-color={color} aria-pressed={selected && bot.color === color}
        aria-label={t(("portrait.color." + color) as LocaleKey)} title={t(("portrait.color." + color) as LocaleKey)}
        onClick={() => choose({ color })}
        className={cn("size-8 rounded-full border-2 border-transparent transition-transform hover:scale-110 disabled:opacity-50", selected && bot.color === color && "ring-2 ring-accent-border ring-offset-2 ring-offset-card")}
        style={{ backgroundColor: MAUS_COLORS[color] }} />)}
    </div>
    <div className="mb-2 mt-4 text-[12px] font-medium text-ink-secondary">{t("portrait.shapes")}</div>
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={t("portrait.shapes")}>
      {MASCOT_BODY_IDS.map(id => <button key={id} type="button" disabled={disabled}
        data-avatar-shape={id} aria-pressed={selected && bodyId === id}
        aria-label={t(("portrait.shape." + id) as LocaleKey)} onClick={() => choose({ mascotBody: id })}
        className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg py-2 disabled:opacity-50", selected && bodyId === id ? "bg-control ring-2 ring-inset ring-accent-border" : "hover:bg-control/60")}>
        <MausAvatar color={bot.color} bodyId={id} state={pinned ?? "idle"} size={36} animated={false} />
        <span className="text-[10.5px] text-ink-secondary">{t(("portrait.shape." + id) as LocaleKey)}</span>
      </button>)}
    </div>
    <div className="mb-2 mt-4 flex items-center justify-between text-[12px] font-medium text-ink-secondary">
      <span>{t("portrait.expressions")}</span>
      <button type="button" disabled={disabled} aria-pressed={selected && !pinned} onClick={() => choose({ mascotExpression: null })}
        className={cn("rounded-md px-2 py-1 text-[11.5px] disabled:opacity-50", selected && !pinned ? "bg-control text-ink" : "hover:bg-control/60")}>
        {t("portrait.expression.auto")}
      </button>
    </div>
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("portrait.expressions")}>
      {EXPRESSIONS.map(expression => <button key={expression} type="button" disabled={disabled}
        data-avatar-face={expression} aria-pressed={selected && pinned === expression} onClick={() => choose({ mascotExpression: expression })}
        className={cn("flex flex-col items-center gap-1.5 rounded-xl p-2 disabled:opacity-50", selected && pinned === expression ? "bg-control ring-2 ring-inset ring-accent-border" : "hover:bg-control/60")}>
        <MausAvatar color={bot.color} bodyId={bodyId} state={expression} size={60} label={t(("portrait.expression." + expression) as LocaleKey)} />
        <span className="text-[11.5px] text-ink-secondary">{t(("portrait.expression." + expression) as LocaleKey)}</span>
      </button>)}
    </div>
  </div>;
}
