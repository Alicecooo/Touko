import { Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/** Finish together: the conversation keeps working until the goal is done. The chip turns accent while it is on. */
export function GoalToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t("composer.goal.aria")}
      title={t("composer.goal.title")}
      onClick={onToggle}
      className={cn(
        "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors",
        on
          ? "border-accent/35 bg-accent/10 text-accent"
          : "border-hairline/20 bg-transparent text-ink-secondary hover:bg-raised hover:text-ink",
      )}
    >
      <Target size={14} aria-hidden="true" />
      {on ? "/goal" : t("composer.goal.chip")}
    </button>
  );
}

