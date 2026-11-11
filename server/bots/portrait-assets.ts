import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePortraitAssetName } from "../../shared/portrait-avatars.ts";

const cached = new Map<string, Buffer>();

/** Only exact catalog filenames can resolve outside the private attachments directory. */
export function readBundledPortrait(name: string): Buffer | null {
  if (!parsePortraitAssetName(name)) return null;
  const root = process.env.OMB_STATIC_DIR
    ? join(process.env.OMB_STATIC_DIR, "portraits")
    : fileURLToPath(new URL("../../public/portraits/", import.meta.url));
  const path = join(root, name);
  const previous = cached.get(path);
  if (previous) return previous;
  try {
    const bytes = readFileSync(path);
    cached.set(path, bytes);
    return bytes;
  } catch {
    return null;
  }
}
