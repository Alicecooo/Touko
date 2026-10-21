import type { ComponentProps } from "react";
import { Check, ListChecks, Paperclip, Plus, Target } from "lucide-react";
import { approvalModeFor } from "../../shared/approval-mode";
import { approvalModeOptions, approvalModeOptionsFor, approvalModeSelectionRequiresLocalDesktop, shownApprovalMode } from "@/lib/approval-mode-options";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { ApprovalModeSelector } from "./ApprovalModeSelector";
import { SidebarPopoverMenu, type SidebarMenuItem } from "./SidebarPopoverMenu";

type ApprovalChoice = ComponentProps<typeof ApprovalModeSelector>;

/** Finish together: the room keeps working until the goal is done. The chip turns accent while it is on. */
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

const check = <Check size={15} className="shrink-0 text-accent" aria-hidden="true" />;

/** The thread's approval level, the same choices the Advanced composer's shield offers, as a submenu. */
function approvalItem(name: string, choice: ApprovalChoice): SidebarMenuItem {
  const trusted = choice.trustedModesAvailable ?? true;
  const mode = shownApprovalMode(choice.driverKind, approvalModeFor({ approvalMode: choice.approvalMode, autoApprove: choice.autoApprove }));
  const all = approvalModeOptions();
  const current = approvalModeOptionsFor(choice.driverKind).find((option) => option.mode === mode)
    ?? all.find((option) => option.mode === mode)
    ?? all[0];
  const localOnly = approvalModeSelectionRequiresLocalDesktop(mode, trusted);
  const modesDisabled = Boolean(choice.disabled) || localOnly;
  const CurrentIcon = current.Icon;
  return {
    key: "approval",
    separatorBefore: true,
    label: t("botSettings.simple.beforeActs", { name }),
    subtitle: current.label,
    note: choice.disabled ? t("approvalMode.busy") : localOnly ? t("approvalMode.customLocalOnlyDot") : undefined,
    icon: <CurrentIcon size={16} />,
    disabled: Boolean(choice.disabled) && !choice.onManageCommandAllowlist,
    onSelect: () => {},
    submenu: [
      ...approvalModeOptionsFor(choice.driverKind, trusted).map((option): SidebarMenuItem => {
        const Icon = option.Icon;
        return {
          key: `approval:${option.mode}`,
          label: option.label,
          note: option.description,
          icon: <Icon size={16} />,
          active: option.mode === mode,
          trailing: option.mode === mode ? check : undefined,
          disabled: modesDisabled,
          onSelect: () => choice.onSelect(option.mode),
        };
      }),
      ...(choice.onManageCommandAllowlist ? [{
        key: "approval:allowlist",
        separatorBefore: true,
        label: t("commandAllowlist.title"),
        icon: <ListChecks size={16} />,
        onSelect: choice.onManageCommandAllowlist,
      } satisfies SidebarMenuItem] : []),
    ],
  };
}

/**
 * Simple mode's round + at the start of the composer: attach a file, Finish together (rooms), the thread's approval
 * level, each running the handler its Advanced button runs.
 */
export function ComposerPlusMenu({ onAttach, goal, approval }: {
  onAttach: () => void;
  goal?: { on: boolean; onToggle: () => void };
  approval?: { name: string; choice: ApprovalChoice };
}) {
  const items: SidebarMenuItem[] = [
    { key: "attach", label: t("composer.attach"), icon: <Paperclip size={16} />, onSelect: onAttach },
    ...(goal ? [{
      key: "goal",
      label: t("composer.goal.aria"),
      icon: <Target size={16} />,
      active: goal.on,
      trailing: goal.on ? check : undefined,
      onSelect: goal.onToggle,
    } satisfies SidebarMenuItem] : []),
    ...(approval ? [approvalItem(approval.name, approval.choice)] : []),
  ];
  return (
    <SidebarPopoverMenu
      items={items}
      ariaLabel={t("common.add")}
      triggerTitle={t("common.add")}
      triggerClassName="flex shrink-0 rounded-full"
      renderTrigger={({ open }) => (
        <span
          data-composer-plus
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-ink transition-colors",
            // An ink tint, not a fill token: in some skins the control fill is the composer's own colour.
            open ? "bg-ink/[0.12]" : "bg-ink/[0.07] hover:bg-ink/[0.12]",
          )}
        >
          <Plus size={17} aria-hidden="true" />
        </span>
      )}
    />
  );
}
