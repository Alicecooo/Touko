import type { CloudBackend } from "../../shared/wire";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export function CloudBackendPicker({
  value,
  compact = false,
  onChange,
}: {
  value: CloudBackend;
  compact?: boolean;
  onChange: (backend: CloudBackend) => void;
}) {
  
  
  return (
    <div className="mt-3 rounded-lg bg-inset p-3">
      <div className="text-[12px] font-medium text-ink">{compact ? t("botAccess.cloud.provider") : t("botAccess.cloud.backend")}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-secondary">
        {compact
          ? t("botAccess.cloud.vpsDescription")
          : t("botAccess.cloud.vpsAutoDescription")}
      </div>
      <div className="mt-2 flex overflow-hidden rounded-lg border border-hairline/40">
        {(["vps"] as const).map((backend, i) => (
          <button
            key={backend}
            onClick={() => onChange(backend)}
            className={cn(
              "flex-1 py-1.5 text-[12px]",
              i > 0 && "border-l border-hairline/40",
              value === backend ? "bg-raised text-ink" : "text-ink-secondary hover:bg-raised/60 hover:text-ink",
            )}
          >
            {t("botAccess.cloud.selfHostedVps")}
          </button>
        ))}
      </div>
    </div>
  );
}
