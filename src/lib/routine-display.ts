import type { Routine, RoutineRun } from "./routines";
import { activeLocale, t } from "./i18n";

export function routineRunTime(run: RoutineRun): number {
  return run.createdAt || run.startedAt || run.scheduledFor;
}

export function latestRoutineRun(routineId: string, runs: readonly RoutineRun[]): RoutineRun | undefined {
  return runs.filter((run) => run.routineId === routineId)
    .reduce<RoutineRun | undefined>((latest, run) => !latest || routineRunTime(run) > routineRunTime(latest) ? run : latest, undefined);
}

export function routineRunLabel(run: RoutineRun): string {
  const status = t(`routines.status.${run.status}`);
  return run.retried && run.status !== "queued" ? t(`routines.retried.${run.retried}`, { status }) : status;
}

export function routineRunTone(run: RoutineRun): string {
  if (run.status === "waiting") return "text-warning";
  if (["failed", "missed"].includes(run.status)) return "text-danger";
  if (run.status === "running") return "text-accent";
  if (run.status === "completed") return "text-success";
  return "text-ink-secondary";
}

export function routineDateTime(at: number): string {
  return new Date(at).toLocaleString(activeLocale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function routineFinished(routine: Routine): boolean {
  return routine.schedule.type === "once" && routine.nextRunAt == null && routine.schedule.at <= Date.now();
}

export function routineScheduleState(routine: Routine): string {
  if (routineFinished(routine)) return t("routines.finishedSchedule");
  return routine.enabled ? t("routines.activeSchedule") : t("routines.pausedSchedule");
}

export function routineNextLabel(routine: Routine): string {
  if (!routine.enabled) return routineScheduleState(routine);
  return routine.nextRunAt == null ? t("routines.noNextRun") : t("routines.nextRun", { time: routineDateTime(routine.nextRunAt) });
}

export function routineRunsOn({ runOn, computer, cloudHome }: {
  runOn?: string; computer?: string | null; cloudHome: boolean;
}): { label: string; hint: string } {
  const hint = t(cloudHome ? "routines.runsOn.cloudHomeHint" : "routines.runsOn.localHint");
  if (runOn === "cloud") return { label: t("routines.runsOn.boat"), hint: t(cloudHome ? "routines.runsOn.boatHintCloudHome" : "routines.runsOn.boatHint") };
  if (computer === "cloud") return { label: t("routines.runsOn.botCloud"), hint };
  if (computer === "vm" && !cloudHome) return { label: t("routines.runsOn.botVm"), hint };
  return { label: t(cloudHome ? "routines.runsOn.cloudHome" : "routines.runsOn.local"), hint };
}
