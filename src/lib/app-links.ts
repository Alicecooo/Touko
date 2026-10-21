export const APP_NAME = "Touko";
export const APP_REPOSITORY = "https://github.com/milind-soni/OpenMausBot";


export const APPROVAL_LEVELS_URL = `${APP_REPOSITORY}/blob/main/docs/approval-levels.md`;

export const RELEASES_URL = `${APP_REPOSITORY}/releases`;






export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}





export async function openExternalLink(url: string): Promise<void> {
  if (window.ogb?.openExternal) {
    await window.ogb.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
