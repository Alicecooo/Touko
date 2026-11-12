import { useEffect, useState } from "react";

import { api, useStore, type Bot } from "@/state/store";
import type { PromptPreviewData } from "./PromptPreview";

export function useBotPrompt(bot: Bot, active: boolean) {
  const { flushBotPatches } = useStore();
  const [prompt, setPrompt] = useState<PromptPreviewData | null>(null);
  const [promptError, setPromptError] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const fetchPrompt = async () => {
      try {
        await flushBotPatches(bot.id);
        if (cancelled) return;
        const data = await api(`/api/bots/${bot.id}/system-prompt`) as PromptPreviewData;
        if (cancelled) return;
        setPrompt(data);
        setPromptError(false);
      } catch {
        if (!cancelled) setPromptError(true);
      }
    };

    void fetchPrompt();
    return () => {
      cancelled = true;
    };
  }, [active, bot.id, flushBotPatches]);

  return { prompt, promptError };
}
