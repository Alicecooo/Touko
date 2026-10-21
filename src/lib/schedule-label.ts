import { activeLocale, t } from "@/lib/i18n";
import { atLocalTime } from "@/lib/routine-calendar";
import type { RoutineSchedule } from "@/lib/routines";
import { cronScheduleLabel } from "../../shared/cron-label";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function dayNames(width: "short" | "narrow" = "short"): string[] {
  const format = new Intl.DateTimeFormat(activeLocale(), { weekday: width, timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2024, 0, 7 + day))));
}

export function niceTime(at: number): string {
  return new Date(at).toLocaleTimeString(activeLocale(), { hour: "numeric", minute: "2-digit" });
}

export function niceDate(at: number): string {
  return new Date(at).toLocaleDateString(activeLocale(), { weekday: "long", month: "long", day: "numeric" });
}

export function whenLabel(at: number): string {
  const date = new Date(at);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay ? niceTime(at) : date.toLocaleDateString(activeLocale(), { month: "short", day: "numeric" });
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return t("schedule.minutes", { count: minutes });
  if (minutes % 60 === 0) return t("schedule.hours", { count: minutes / 60 });
  return t("schedule.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

export function intervalLabel(minutes: number): string {
  return t("schedule.every", { duration: durationLabel(minutes) });
}

function intervalRestrictions(schedule: Extract<RoutineSchedule, { type: "interval" }>): string[] {
  const details: string[] = [];
  if (schedule.weekdays && schedule.weekdays.length < 7) {
    details.push(schedule.weekdays.join(",") === "1,2,3,4,5"
      ? t("calendar.editor.weekdays")
      : schedule.weekdays.map((day) => dayNames()[day]).join(", "));
  }
  if (schedule.window) {
    const wallTime = (time: string) => {
      const [hour, minute] = time.split(":").map(Number);
      return niceTime(new Date(2000, 0, 1, hour, minute).getTime());
    };
    details.push(`${wallTime(schedule.window.start)}–${wallTime(schedule.window.end)}`);
  }
  if (schedule.endsAt != null) {
    details.push(t("schedule.until", { date: new Date(schedule.endsAt).toLocaleDateString(activeLocale(), { month: "short", day: "numeric", year: "numeric" }) }));
  }
  return details;
}

export function scheduleLabel(schedule: RoutineSchedule | { type: "once"; at: number } | { type: "daily"; time: string; weekdays: number[] }): string {
  if (schedule.type === "cron") return cronScheduleLabel(schedule, activeLocale());
  if (schedule.type === "once") return `${niceDate(schedule.at)}, ${niceTime(schedule.at)}`;
  if (schedule.type === "interval") {
    return [intervalLabel(schedule.everyMinutes), ...intervalRestrictions(schedule)].join(" · ");
  }
  const days = schedule.weekdays;
  const label = days.length === 7
    ? t("calendar.editor.everyDay")
    : days.join(",") === "1,2,3,4,5"
      ? t("calendar.editor.weekdays")
      : days.length === 1
        ? t("schedule.weekly", { day: dayNames()[days[0]!] })
        : days.map((day) => dayNames()[day]).join(", ");
  return t("schedule.at", { days: label, time: niceTime(atLocalTime(Date.now(), schedule.time)) });
}

export function scheduleSentence(schedule: RoutineSchedule): string {
  if (activeLocale().startsWith("zh")) return scheduleLabel(schedule);
  if (schedule.type === "cron") return cronScheduleLabel(schedule, activeLocale());
  if (schedule.type === "interval") {
    const label = intervalLabel(schedule.everyMinutes);
    const lowercase = label.replace(/^Every /, "every ");
    const withMinutes = lowercase.replace(/(\d+) min(?!ute)/g, "$1 minutes");
    const cadence = withMinutes.replace(/(\d+) hr(?!our)/g, (_match, num) => {
      return num === "1" ? "1 hour" : `${num} hours`;
    });
    return [cadence, ...intervalRestrictions(schedule)].join(" · ");
  }
  if (schedule.type === "once") {
    return `once on ${niceDate(schedule.at)}, ${niceTime(schedule.at)}`;
  }
  const days = schedule.weekdays;
  const timeStr = niceTime(atLocalTime(Date.now(), schedule.time));

  if (days.length === 7) {
    return `every day at ${timeStr}`;
  }
  if (days.join(",") === "1,2,3,4,5") {
    return `every weekday at ${timeStr}`;
  }
  if (days.length === 1) {
    return `weekly on ${dayNames()[days[0]!]} at ${timeStr}`;
  }

  return `${days.map((day) => dayNames()[day]).join(", ")} at ${timeStr}`;
}
