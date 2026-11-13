import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import type { Bot } from "@/state/store";
import { portraitFromAvatarUrl } from "../../../shared/portrait-avatars";
import { MascotAvatarPicker } from "../MascotAvatarPicker";
import { AvatarFraming, OrganizationAvatarIcons, useAvatarImage, type AvatarPatch } from "../avatar-editing";

export type AvatarEditorTab = "bot" | "upload";
const TABS: ReadonlyArray<readonly [AvatarEditorTab, LocaleKey]> = [
  ["bot", "portrait.tab"], ["upload", "botPanel.avatar.tabUpload"],
];

export function AvatarEditorCard({ bot, onPatch, onClose }: {
  bot: Bot;
  onPatch: (patch: AvatarPatch) => void;
  onClose: () => void;
}) {
  const { fileRef, uploading, busy, error, upload, removeImage } = useAvatarImage(bot, onPatch);
  const customImage = Boolean(bot.avatarUrl) && !portraitFromAvatarUrl(bot.avatarUrl);
  const [tab, setTab] = useState<AvatarEditorTab>(customImage ? "upload" : "bot");
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(); }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); onClose();
  };
  return <div role="dialog" aria-label={t("botPanel.avatar.edit")} data-panel-avatar-editor onKeyDown={onKeyDown}
    className="absolute inset-x-[-6px] top-[92px] z-30 overflow-hidden rounded-2xl border border-ink/[0.08] bg-menu text-left shadow-2xl shadow-black/50">
    <div ref={tabsRef} className="flex items-center gap-0.5 border-b border-ink/[0.06] p-2" role="tablist" aria-label={t("botPanel.avatar.edit")}>
      {TABS.map(([id, key]) => <button key={id} type="button" role="tab" aria-selected={tab === id} data-avatar-tab={id}
        id={"avatar-" + bot.id + "-tab-" + id} aria-controls={"avatar-" + bot.id + "-panel-" + id}
        onClick={() => setTab(id)} className={cn("rounded-lg px-[11px] py-[5px] text-[13px]", tab === id ? "bg-ink/[0.08] font-medium text-ink" : "text-ink-secondary hover:text-ink")}>
        {t(key)}
      </button>)}
    </div>
    <div role="tabpanel" id={"avatar-" + bot.id + "-panel-" + tab} aria-labelledby={"avatar-" + bot.id + "-tab-" + tab}
      className="max-h-[min(650px,calc(100dvh-200px))] overflow-y-auto p-3">
      {tab === "bot" && <MascotAvatarPicker bot={bot} disabled={busy} onPatch={onPatch} />}
      {tab === "upload" && <>
        <OrganizationAvatarIcons busy={busy} onUpload={file => void upload(file)} />
        {customImage && <AvatarFraming bot={bot} disabled={busy} onPatch={onPatch} />}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={event => void upload(event.target.files?.[0])} />
        <button type="button" data-avatar-drop disabled={busy} onClick={() => fileRef.current?.click()}
          onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files?.[0]); }}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-ink/15 px-3 py-6 text-center text-[13px] text-ink-secondary hover:border-ink/25 hover:text-ink disabled:opacity-50">
          {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
          <span>{t("botPanel.avatar.drop")}</span><span className="text-[11.5px] text-ink-tertiary">{t("botPanel.avatar.types")}</span>
        </button>
        {customImage && <button type="button" onClick={removeImage} disabled={busy}
          aria-label={t("botIdentity.removeAvatar")}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50">
          <Trash2 size={14} />{t("botIdentity.removeImage")}
        </button>}
      </>}
      {error && <div role="alert" className="mt-3 text-[12px] text-danger">{error}</div>}
    </div>
  </div>;
}
