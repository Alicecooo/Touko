import { rmSync } from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "../config/config.ts";

export const BOTS_DIR = join(DATA_DIR, "bots");
export function botFolder(botId: string): string {
  return join(BOTS_DIR, botId);
}

export function removeBotFolder(botId: string): void {
  try {
    rmSync(botFolder(botId), { recursive: true, force: true });
  } catch {}
}

