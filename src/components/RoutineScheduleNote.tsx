
import { t } from "@/lib/i18n";
import { localDesktopPage } from "./onboarding/WelcomeGate";

export function RoutineScheduleNote() {
 const local = localDesktopPage();
 return <p className="text-[11px] leading-relaxed text-ink-secondary">{t(local ? "routines.scheduleNote.local" : "routines.scheduleNote.server")}</p>;
}
