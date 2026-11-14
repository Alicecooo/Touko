import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { openExternalLink } from "@/lib/app-links";

export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";

export function ManageUsageLink({ href, className, children }: { href: string; className: string; children?: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={(event) => {
    if (window.ogb?.openExternal) { event.preventDefault(); void openExternalLink(href); }
  }}>{t("engineSetup.chatgpt.manageUsage")}{children}</a>;
}
