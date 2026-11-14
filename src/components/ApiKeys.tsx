import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, useStore, type ConfigStatus } from "@/state/store";
import { t } from "@/lib/i18n";
import { keyRemoved, keySaveFailure, keySaved, savedKeyResult } from "@/lib/product-events";
import { SECTION_PROVIDER, type KeyVia } from "@/lib/analytics-allowlist";

export function ApiKeyRow({ onSaved, via = "settings" }: {
  section: "composio";
  onSaved?: (configured: boolean) => void;
  via?: KeyVia;
}) {
  const { state, dispatch } = useStore();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const saveAfterPaste = useRef(false);
  const configured = state.config?.composio?.configured === true;
  const ownKey = state.config?.composio?.mode === "self-hosted";

  const save = (remove = false) => {
    const next = remove ? "" : value.trim();
    if (savingRef.current || (!remove && !next)) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const request = window.ogb?.setCredential
      ? window.ogb.setCredential("composioApiKey", next)
      : api("/api/config", { method: "PUT", body: JSON.stringify({ composio: { apiKey: next } }) });
    request
      .then((status: ConfigStatus) => {
        dispatch({ type: "configStatus", config: status });
        setValue("");
        const nowConfigured = status.composio?.configured === true;
        onSaved?.(nowConfigured);
        if (!next) {
          if (ownKey) keyRemoved(SECTION_PROVIDER.composio, via);
        } else {
          keySaved(SECTION_PROVIDER.composio, via, savedKeyResult(SECTION_PROVIDER.composio));
        }
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        if (next) keySaved(SECTION_PROVIDER.composio, via, keySaveFailure(cause));
      })
      .finally(() => { savingRef.current = false; setSaving(false); });
  };

  useEffect(() => {
    if (!saveAfterPaste.current) return;
    saveAfterPaste.current = false;
    save();
  });

  return <div data-api-key-row="composio">
    <div className="mb-1.5 flex items-center gap-2 text-[13px] text-ink-secondary">
      <span className={`size-1.5 rounded-full ${configured ? "bg-success" : "bg-raised-hover"}`} />
      <span>{t("keys.composio.label")}</span>
      {configured && <span className="text-[11px]">{t("keys.configured")}</span>}
    </div>
    <div className="flex gap-2">
      <div className="relative w-full">
        <input
          type="password"
          value={value}
          onChange={(event) => { setError(null); setValue(event.target.value); }}
          onPaste={() => { saveAfterPaste.current = true; }}
          onBlur={() => save()}
          onKeyDown={(event) => event.key === "Enter" && save()}
          disabled={saving}
          placeholder={configured ? t("keys.replace") : "ak_…"}
          aria-label={t("keys.composio.label")}
          autoComplete="off"
          className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 pr-8 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
        />
        {saving && <Loader2 size={13} aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-ink-secondary" />}
      </div>
      {!value.trim() && configured && <button type="button" onClick={() => save(true)} disabled={saving} className="ui-button text-danger">{t("keys.clear")}</button>}
    </div>
    {error && <div role="alert" className="mt-1 text-[12px] text-danger">{error}</div>}
  </div>;
}
