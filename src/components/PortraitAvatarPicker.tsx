import type { Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { normalizeState } from "@/lib/bot-appearance";
import { PORTRAIT_CHARACTERS, PORTRAIT_EXPRESSIONS, defaultPortraitCharacter, portraitAvatarUrl, portraitFromAvatarUrl, type PortraitCharacter, type PortraitExpression } from "../../shared/portrait-avatars";
import { PortraitAvatar } from "./Avatar";
import type { AvatarPatch } from "./avatar-editing";

const characterLabel = (id: PortraitCharacter) => t(("portrait.character." + id) as LocaleKey);
const expressionLabel = (id: PortraitExpression) => t(("portrait.expression." + id) as LocaleKey);

export function PortraitAvatarPicker({ bot, disabled, onPatch }: {
  bot: Bot;
  disabled: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const portrait = portraitFromAvatarUrl(bot.avatarUrl);
  const character = portrait?.character ?? defaultPortraitCharacter(bot.id || bot.name || bot.color);
  const pinned = normalizeState(bot.mascotExpression);
  const expression = pinned ?? portrait?.expression ?? "idle";
  const selected = Boolean(portrait) || !bot.avatarUrl;
  const choose = (nextCharacter: PortraitCharacter, nextExpression: PortraitExpression) => onPatch({
    avatarUrl: portraitAvatarUrl(nextCharacter, nextExpression),
    avatarCrop: "rounded", avatarZoom: 1, avatarFocusX: 0.5, avatarFocusY: 0.5,
    mascotExpression: nextExpression,
  });

  return <div data-portrait-picker>
    <div className="flex items-center gap-4 rounded-xl bg-inset p-3">
      <PortraitAvatar character={character} expression={expression} size={88} label={characterLabel(character)} />
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink">{characterLabel(character)}</div>
        <div className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{t("portrait.hint")}</div>
      </div>
    </div>
    <div className="mb-2 mt-4 text-[12px] font-medium text-ink-secondary">{t("portrait.characters")}</div>
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("portrait.characters")}>
      {PORTRAIT_CHARACTERS.map(id => <button key={id} type="button" disabled={disabled}
        aria-pressed={selected && character === id} onClick={() => choose(id, expression)}
        className={cn("flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-2 disabled:opacity-50", selected && character === id ? "bg-control ring-2 ring-inset ring-accent-border" : "hover:bg-control/60")}>
        <PortraitAvatar character={id} size={64} label={characterLabel(id)} />
        <span className="text-[12px] text-ink">{characterLabel(id)}</span>
      </button>)}
    </div>
    <div className="mb-2 mt-4 text-[12px] font-medium text-ink-secondary">{t("portrait.expressions")}</div>
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("portrait.expressions")}>
      {PORTRAIT_EXPRESSIONS.map(face => <button key={face} type="button" disabled={disabled}
        data-avatar-face={face} aria-pressed={selected && expression === face}
        onClick={() => choose(character, face)}
        className={cn("flex flex-col items-center gap-1.5 rounded-xl p-2 disabled:opacity-50", selected && expression === face ? "bg-control ring-2 ring-inset ring-accent-border" : "hover:bg-control/60")}>
        <PortraitAvatar character={character} expression={face} size={60} label={expressionLabel(face)} />
        <span className="text-[11.5px] text-ink-secondary">{expressionLabel(face)}</span>
      </button>)}
    </div>
  </div>;
}
