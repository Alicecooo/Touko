import { Menu } from "electron";
import environmentsModule from "./environments.cjs";

const { serverMenuLabels } = environmentsModule;

export function buildApplicationMenu({ environments, activeId, onSwitch, onConnect, onForget, labels = serverMenuLabels(), sublabels = {} }) {
  const active = environments.find((entry) => entry.id === activeId) ?? null;
  return Menu.buildFromTemplate([
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: labels.server,
      submenu: [
        { label: labels.local, type: "radio", checked: !active, click: () => onSwitch("local") },
        ...environments.map((entry) => ({
          label: `${entry.name} — ${Object.hasOwn(sublabels, entry.id) ? sublabels[entry.id] : entry.kind === "local" ? entry.dataDir : new URL(entry.origin).host}`,
          type: "radio",
          checked: entry.id === activeId,
          click: () => onSwitch(entry.id),
        })),
        { type: "separator" },
        { label: labels.connect, click: onConnect },
        { label: active ? labels.forgetNamed(active.name) : labels.forget, enabled: Boolean(active), click: () => active && onForget(active.id) },
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
}
