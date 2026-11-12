import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { brand } from "@/lib/brand";
import { t } from "@/lib/i18n";

export function DesktopWorkspaceSwitcher({ inline = false, pill = false }: {
  inline?: boolean; pill?: boolean;
}) {
  const bridge = window.ogb?.workspaces;
  const [workspace, setWorkspace] = useState<{ local: boolean; name: string } | null>(null);
  const name = brand().name;
  useEffect(() => { let active = true; void bridge?.state().then(value => { if (active) setWorkspace(value); }); return () => { active = false; }; }, [bridge]);
  const icon = <img src="/app-icon-192.png?v=moon-1" alt="" className="size-6 shrink-0 rounded-md" />;
  if (!bridge) return <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">{icon}<span className="truncate">{name}</span></span>;
  return <button type="button" onClick={() => void bridge.menu()} title={workspace ? `${name} · ${workspace.local ? t("serverSwitcher.thisComputer") : workspace.name}` : name} aria-label={t("serverSwitcher.switch", { app: name })}
    className={cn("flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2 text-sm font-medium text-ink hover:bg-raised", inline && "max-w-full", pill && "rounded-full")}>
    {icon}<span className="truncate">{name}</span><ChevronDown size={13} />
  </button>;
}
