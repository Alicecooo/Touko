
import { t } from "@/lib/i18n";
export function RoutineScheduleNote() {
 const local = window.ogb?.remoteClient !== undefined;
 return <p className="text-[11px] leading-relaxed text-ink-secondary">{t(local ? "routines.scheduleNote.local" : "routines.scheduleNote.server")}</p>;
}
