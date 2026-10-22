
import { toolSurfaceKind } from "../../shared/tool-surface";
import type { Bot, Task } from "@/state/store";
import type { LocaleKey } from "@/locales";

export type Place = "cloud" | "local" | "browser";
export const PLACES: readonly Place[] = ["cloud", "local", "browser"];
export type EffectivePlace = Place | "auto" | "off";

export function placeOffered(_place: Place, _config: { cloudHome?: boolean } | null | undefined): boolean {
  return true;
}

export function effectivePlace(bot: Pick<Bot, "computer">, task?: Pick<Task, "surface"> | null): EffectivePlace {
  if (bot.computer === "off") return "off";
  return task?.surface ?? bot.computer ?? "auto";
}

export function isComputerPlace(place: EffectivePlace): place is "cloud" | "local" {
  return place === "cloud" || place === "local";
}

export function placeLabelKey(place: EffectivePlace): LocaleKey {
  return `place.${place}` as LocaleKey;
}

export function toolPlace(toolName: string, effective: EffectivePlace): Place | null {
  const kind = toolSurfaceKind(toolName);
  if (kind === "browser") return "browser";
  if (kind === "computer") return isComputerPlace(effective) ? effective : null;
  return null;
}
