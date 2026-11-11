export type ComputerPanelView = "routines" | "files" | "data";

export function computerPanelTabs(): ComputerPanelView[] {
  return ["files", "routines", "data"];
}

export function resolveComputerPanelView(view: ComputerPanelView): ComputerPanelView {
  return computerPanelTabs().includes(view) ? view : "files";
}

const STORAGE_PREFIX = "omb-computer-panel-view";

function storageKey(botId: string): string {
  return `${STORAGE_PREFIX}:${botId}`;
}

export function readComputerPanelView(
  botId: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): ComputerPanelView {
  try {
    const value = storage.getItem(storageKey(botId));
    if (value === "routines" || value === "files" || value === "data") return value;
  } catch {
  }
  return "files";
}

export function writeComputerPanelView(
  botId: string,
  view: ComputerPanelView,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(storageKey(botId), view);
  } catch {
  }
}
