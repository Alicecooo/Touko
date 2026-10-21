import { Gauge, Settings as SettingsIcon } from "lucide-react";
import { InitialsAvatar } from "./Avatar";
import { SidebarPopoverMenu, type SidebarMenuItem } from "./SidebarPopoverMenu";
import { useStore } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export function profileInitials(profile?: { name?: string; email?: string }): string {
  const name = profile?.name?.trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
  const email = profile?.email?.trim();
  return email ? email[0]!.toUpperCase() : "?";
}

export function profileLabel(profile?: { name?: string; email?: string }): string {
  return profile?.name?.trim() || profile?.email?.trim() || t("sidebar.profile.you");
}

export function profileMenuItems({ usage, onUsage, onSettings }: {
  usage: boolean;
  onUsage: () => void;
  onSettings: () => void;
}): SidebarMenuItem[] {
  return [
    ...(usage ? [{ key: "usage", label: t("settings.section.usage"), icon: <Gauge size={18} />, onSelect: onUsage }] : []),
    { key: "settings", label: t("sidebar.menu.settings"), icon: <SettingsIcon size={18} />, onSelect: onSettings },
  ];
}

export function SidebarProfileMenu({ iconOnly = false, rail = false }: { iconOnly?: boolean; rail?: boolean } = {}) {
  const { state, dispatch } = useStore();
  const profile = state.config?.profile;
  const name = profileLabel(profile);
  const items = profileMenuItems({
    usage: window.ogb?.remoteClient?.active !== true,
    onUsage: () => dispatch({ type: "toggleAppSettings", open: true, section: "usage" }),
    onSettings: () => dispatch({ type: "toggleAppSettings" }),
  });

  return (
    <SidebarPopoverMenu
      items={items}
      ariaLabel={name}
      triggerClassName={iconOnly ? "shrink-0 rounded-xl" : "w-full"}
      triggerTitle={iconOnly ? name : undefined}
      renderTrigger={({ open }) => iconOnly ? (
        <span className={cn(
          "relative flex items-center justify-center rounded-xl transition-colors",
          rail ? "size-10" : "size-[46px]",
          open ? "bg-raised" : "hover:bg-raised/50",
        )}>
          <InitialsAvatar initials={profileInitials(profile)} size={rail ? 30 : 28} />
        </span>
      ) : (
        <span className={cn(
          "flex min-h-[46px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
          open ? "bg-raised" : "hover:bg-raised/50",
        )}>
          <InitialsAvatar initials={profileInitials(profile)} size={28} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-ink">{name}</span>
        </span>
      )}
    />
  );
}
