import type { RoutineCronSchedule } from "./routine-schedule.ts";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Describe familiar presets; retain the exact expression for everything else.
 * This is presentation only, never a second parser or source of scheduling truth. */
export function cronScheduleLabel(schedule: RoutineCronSchedule, locale = "en"): string {
  const chinese = /^zh/i.test(locale);
  const traditional = /^zh-(?:tw|hk|mo|hant)/i.test(locale);
  const weekdayName = (day: number) => chinese
    ? new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)))
    : WEEKDAYS[day];
  const [minute, hour, day, month, weekday] = schedule.expression.trim().split(/\s+/);
  let label = `Cron ${schedule.expression}`;
  if (/^\d+$/.test(minute ?? "") && /^\d+$/.test(hour ?? "")) {
    const time = `${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
    const monthDay = /^\d+$/.test(day ?? "") ? Number(day) : null;
    if (weekday === "*" && month === "*") {
      if (day === "*") label = chinese ? `每天 ${time}` : `Every day at ${time}`;
      else if (day === "L") label = chinese ? `每月最后一天 ${time}`.replace("后", traditional ? "後" : "后") : `Monthly on the last day at ${time}`;
      else if (monthDay !== null) label = chinese ? `每月 ${monthDay} 日 ${time}` : `Monthly on day ${monthDay} at ${time}`;
    } else if (weekday === "*" && /^\d+$/.test(month ?? "") && monthDay !== null) {
      const name = MONTHS[Number(month) - 1];
      if (name) label = chinese ? `每年 ${Number(month)} 月 ${monthDay} 日 ${time}` : `Yearly on ${name} ${monthDay} at ${time}`;
    } else if (day === "*" && month === "*") {
      if (weekday === "1-5" || weekday?.toUpperCase() === "MON-FRI") label = chinese ? `每个工作日 ${time}`.replace("个", traditional ? "個" : "个") : `Every weekday at ${time}`;
      else if (/^[0-7]$/.test(weekday ?? "")) label = chinese ? `每${weekdayName(Number(weekday) % 7)} ${time}` : `Weekly on ${WEEKDAYS[Number(weekday) % 7]} at ${time}`;
      else {
        const nth = /^([0-7])#([1-5]|L)$/i.exec(weekday ?? "");
        if (nth) {
          const order = nth[2]!.toUpperCase() === "L" ? "last" : ["", "first", "second", "third", "fourth", "fifth"][Number(nth[2])];
          label = chinese
            ? `每月${nth[2]!.toUpperCase() === "L" ? traditional ? "最後一個" : "最后一个" : `第 ${nth[2]} 个`.replace("个", traditional ? "個" : "个")}${weekdayName(Number(nth[1]) % 7)} ${time}`
            : `Monthly on the ${order} ${WEEKDAYS[Number(nth[1]) % 7]} at ${time}`;
        }
      }
    }
  }
  return `${label} · ${schedule.timeZone}`;
}
