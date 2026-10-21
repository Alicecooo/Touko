// What this desktop keeps whatever page its window shows, whichever port its own page is served on: the notices it
// has shown and its usage-analytics switch.
import fs from "node:fs";



export { DESKTOP_PORTS } from "./desktop-ports.mjs";
/** The only notices a page may record, so no page can write anything else into the file. */
export const DESKTOP_NOTICES = Object.freeze([]);



const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Security: a write that fails (a full disk, a kill mid-write) leaves the last whole record, analytics opt-out included.
 * A file another tool saved with a byte-order mark (Notepad on Windows) still reads. */
export function jsonFile(file, files = fs) {
  return {
    read: () => JSON.parse(files.readFileSync(file, "utf8").replace(/^\uFEFF/, "")),
    write: value => {
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        files.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
        files.renameSync(temporary, file);
      } catch (error) {
        try { files.rmSync(temporary, { force: true }); } catch {}
        throw error;
      }
    },
  };
}

function parse(raw) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const seen = Array.isArray(record.seen) ? DESKTOP_NOTICES.filter(id => record.seen.includes(id)) : [];
  const shown = Object.fromEntries(DESKTOP_NOTICES.flatMap(id => {
    const day = record.shown && typeof record.shown === "object" ? record.shown[id] : undefined;
    return typeof day === "string" && DAY.test(day) ? [[id, day]] : [];
  }));
  return { seen, shown, ...(typeof record.analytics === "boolean" ? { analytics: record.analytics } : {}) };
}

/** A record that cannot be written is still kept for this launch. */
export function createDesktopPrefs({ read, write, now = Date.now }) {
  let record = null;
  const current = () => {
    if (record) return record;
    let raw = null;
    try { raw = read(); } catch {}
    return (record = parse(raw));
  };
  const save = next => { record = next; try { write(next); } catch {} };
  return {
    seen: () => [...current().seen],
    markSeen(id) {
      const saved = current();
      if (DESKTOP_NOTICES.includes(id) && !saved.seen.includes(id)) save({ ...saved, seen: [...saved.seen, id] });
    },
    /** True the first time a notice not yet seen counts as shown on a calendar day. */
    shown(id) {
      const saved = current(), day = localDay(now());
      if (!DESKTOP_NOTICES.includes(id) || saved.seen.includes(id) || saved.shown[id] === day) return false;
      save({ ...saved, shown: { ...saved.shown, [id]: day } });
      return true;
    },
    /** null until a choice is saved. */
    analytics: () => current().analytics ?? null,
    setAnalytics(enabled) { save({ ...current(), analytics: enabled === true }); },
  };
}

/**
 * `page(event)`: "local" for this computer's page, "cloud" for My Cloud's own page as main verifies it, "server" for
 * another saved server open in this desktop's window, null for anything else. `cloudOffered()`: this desktop sells
 * MausBot Cloud, asked once its Cloud sign-in is restored. `localConfig()`: This computer's own workspace's config.json.
 * `thisComputer(landing)`: switches the window to This computer and loads its page at `landing`; false when it cannot,
 * or when that page does not load.
 */
export function registerDesktopPrefs({ ipcMain, read, write, page, now = Date.now }) {
 const store = createDesktopPrefs({read, write, now});
 ipcMain.on("desktop-analytics:state", event => { try { const asking=page(event), saved=store.analytics(); event.returnValue=asking === "local" ? saved : asking && saved === false ? false : null; } catch {event.returnValue=null;} });
 ipcMain.handle("desktop-analytics:set", (event, enabled) => {if(page(event)!=="local")throw new Error("Analytics settings require the local app"); store.setAnalytics(enabled === true);});
}

function localDay(now) { const date=new Date(now), two=value=>String(value).padStart(2,"0"); return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}`; }
