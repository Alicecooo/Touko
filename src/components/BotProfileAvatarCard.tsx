import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { portraitFromAvatarUrl } from "../../shared/portrait-avatars";
import { MascotAvatarPicker } from "./MascotAvatarPicker";
import { AvatarFraming, OrganizationAvatarIcons, useAvatarImage, type AvatarPatch } from "./avatar-editing";

export function BotProfileAvatarCard({ bot, onPatch }: {
  bot: Bot;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const { fileRef, uploading, busy, error, upload, removeImage } = useAvatarImage(bot, onPatch);
  const customImage = Boolean(bot.avatarUrl) && !portraitFromAvatarUrl(bot.avatarUrl);
  return <div className="overflow-hidden rounded-xl border border-hairline/40 bg-card">
    <div className="flex items-center justify-between border-b border-hairline/40 px-3 py-2.5">
      <span className="text-[14px] font-medium text-ink">{t("botIdentity.avatar")}</span>
    </div>
    <div className="p-3">
      {customImage && <AvatarFraming bot={bot} disabled={busy} onPatch={onPatch} />}
      <MascotAvatarPicker bot={bot} disabled={busy} onPatch={onPatch} />
      <details className="mt-4 border-t border-hairline/40 pt-3" open={customImage || undefined}>
        <summary className="cursor-pointer text-[13px] text-ink-secondary">{t("portrait.custom")}</summary>
        <div className="pt-3">
          <OrganizationAvatarIcons busy={busy} onUpload={file => void upload(file)} />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={event => void upload(event.target.files?.[0])} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-control px-3 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-50">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}{t("botIdentity.uploadImage")}
            </button>
            {customImage && <button type="button" disabled={busy} onClick={removeImage} aria-label={t("botIdentity.removeAvatar")}
              className="flex size-10 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50"><Trash2 size={14} /></button>}
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-secondary">{t("botIdentity.imageTypes")}</p>
        </div>
      </details>
      {error && <div role="alert" className="mt-3 text-[12px] text-danger">{error}</div>}
    </div>
  </div>;
}
