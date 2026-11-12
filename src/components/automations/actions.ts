// What a person can do to an automation, the same from the page, its panel and the chat card.
import { useState } from "react";

import type { Automation } from "@/lib/automations";
import type { RoutineRun } from "@/lib/routines";
import { useShowThreads } from "@/lib/thread-preferences";
import { openBotThread, useStore } from "@/state/store";

export function useAutomationActions() {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const attempt = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try { await work(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(null); }
  };

  const toggle = (automation: Automation) => {
    if (automation.kind === "schedule") {
      dispatch({ type: "updateRoutine", routineId: automation.id, patch: { enabled: !automation.enabled } });
      return;
    }
    return;
  };

  const runNow = (automation: Automation) => attempt(`run:${automation.id}`, () => automation.kind === "schedule"
    ? new Promise<void>((resolve, reject) => dispatch({ type: "runRoutine", routineId: automation.id, onStarted: () => resolve(), onError: reject }))
    : Promise.resolve());

  /** Asks once (a person deleting their own automation), then deletes it. */
  const remove = async (automation: Automation, question: string): Promise<boolean> => {
    if (!window.confirm(question)) return false;
    if (automation.kind === "schedule") {
      dispatch({ type: "deleteRoutine", routineId: automation.id });
      return true;
    }
    return false;
  };


  const openRun = (automation: Automation, run: RoutineRun | undefined) => {
    const bot = state.bots.find((candidate) => candidate.id === automation.botId);
    if (bot && run?.threadId) openBotThread(dispatch, bot, run.threadId, showThreads);
  };

  return { busy, error, setError, toggle, runNow, remove, openRun };
}
