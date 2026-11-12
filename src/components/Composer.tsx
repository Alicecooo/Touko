import { directMessageSent } from "@/lib/product-events";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { ArrowUp, BookOpen, Clock, Paperclip, Sparkles, Square, Target, Users, X } from "lucide-react";
import { useStore, visibleMessages, currentTaskBot, type Bot, type Message } from "@/state/store";
import { cn } from "@/lib/cn";
import { useMenuMotion } from "./MenuMotion";
import { activeLocale, t } from "@/lib/i18n";
import { imeComposing, sendKeyLabel, sendsMessage, useSendKey } from "@/lib/send-key";
import { draftRevision, appendDraftAttachments, changeDraftAttachmentPending, forgetFailedComposerSend, markDraftEdited, prependComposerDraft, recoverFailedComposerSend, rememberFailedComposerSend, replaceDraftAttachment, restoredSendId, restoredRequestText, useComposerDraft, useDraftAttachmentPending, useFailedComposerSends, type ComposerSendSnapshot, type FailedComposerSend } from "@/lib/drafts";
import { BotAvatar } from "./Avatar";
import { ComposerMenuRow } from "./ComposerMenuRow";
import { MentionTextarea } from "./MentionTextarea";
import { ComposerAttachments, pathForFile } from "./ComposerAttachments";
import { splitTranscriptCitations, type CitationAttachment } from "@/lib/citations";
import { LocalComputerAutoWarning } from "./LocalComputerAutoWarning";
import { ApprovalModeSelector } from "./ApprovalModeSelector";
import { approvalModeFor, type ApprovalMode } from "../../shared/approval-mode";
import { appendPastedText, handoffAttachmentImagePreview, clipboardHasImages, clipboardImageFiles, composeMessage, composerShouldRefocus, composerTakesFocusOnOpen, imageAttachmentFromFile, replyTargetTakesFocus, intakeFiles, isLongPaste, optimisticImageAttachment, pasteAttachment, releaseAttachmentImagePreview, type Attachment, type PasteAttachment } from "@/lib/composer-attachments";

import { PendingApprovalActions, PendingApprovalPanel, pendingApprovals } from "./PendingApproval";
import { useDesktopCapabilities } from "./DesktopCapabilities";
import { ComposerReplyStrip } from "./ReplyQuote";
import { escapeCancelsReply } from "@/lib/replies";
import { useThreadRefs } from "./ThreadRefs";
import { QueuedComposerMessages, composerCanSteerQueuedMessages, doubleEnterSteerWindowExpiresAt, doubleEnterSteersQueue } from "./ComposerQueuedMessages";
import { skillAuthoringEnabled } from "@/lib/feature-flags";
import { mentionChoicesForQuery, mentionQueryAt } from "@/lib/mentions";
import { serializeThreadRefs, threadTokenFromPaste, threadTokenSpacing } from "@/lib/thread-refs";
import { composerSlashTrigger, replaceComposerSlashTrigger, skillSlashCommands, slashCommandMatches, type ComposerSlashCommand } from "@/lib/composer-commands";
import { useSlashSkills } from "@/lib/use-slash-skills";

type MentionChoice = { id: string; name: string; bot?: Bot };

interface ComposerDraftSnapshot extends ComposerSendSnapshot {
  reply: Message | null;
}

export function Composer({
  bot: profile,
  onEditLast,
  replyTo,
  onClearReply,
  onConsumeReply,
  onRestoreReply,
  locked: setupLocked = false,
}: {
  bot?: Bot;
  onEditLast?: () => void;
  replyTo?: Message | null;
  onClearReply?: () => void;
  onConsumeReply?: () => void;
  onRestoreReply?: (message: Message, threadId: string) => void;
  locked?: boolean;
}) {
  const bot = profile ? currentTaskBot(profile) : undefined;
  const locked = setupLocked || Boolean(bot?.awaitingThreadSnapshot);
  const { state, dispatch } = useStore();
  const { threads, currentBotId } = useThreadRefs();
  const { capabilities } = useDesktopCapabilities();
  const sendKey = useSendKey();
  const sendLabel = sendKeyLabel(sendKey);
  const remoteClient = window.ogb?.remoteClient?.active === true;
  const threadId = bot?.threadId ?? "";
  const busy = Boolean(bot?.busy);
  const steerInstanceId = bot?.modelSelection.instanceId;
  const canSteer =
    state.instances.find((i) => i.instanceId === steerInstanceId)?.capabilities?.queueing === true;
  // Visible branch only: an approval left on an abandoned branch must not block the composer.
  const approvals = pendingApprovals(bot ? visibleMessages(bot) : []);
  const approval = approvals[0];
  const approvalBot = bot;
  const busyName = bot?.name ?? t("composer.busy.theBot");
  const draftId = `bot:${bot?.id ?? ""}:${bot?.threadId ?? ""}`;
  const [text, setText, attachments, setAttachments] = useComposerDraft(
    draftId,
    bot ? `bot:${bot.id}` : undefined,
  );
  const attachmentPending = useDraftAttachmentPending(draftId);
  const failedSends = useFailedComposerSends(draftId);
  const editText = useCallback(
    (next: string) => {
      markDraftEdited(draftId);
      setText(next);
    },
    [draftId, setText],
  );
  const editAttachments = useCallback(
    (next: SetStateAction<Attachment[]>) => {
      markDraftEdited(draftId);
      setAttachments(next);
    },
    [draftId, setAttachments],
  );
  const restoreDraft = useCallback(
    (sent: ComposerDraftSnapshot) => {
      if (recoverFailedComposerSend(sent) === "restored") {
        if (sent.reply) onRestoreReply?.(sent.reply, sent.threadId);
      }
    },
    [onRestoreReply],
  );
  const addAttachments = useCallback(
    (next: Attachment[]) => appendDraftAttachments(draftId, next),
    [draftId],
  );
  const removeAttachment = useCallback(
    (id: string) => {
      const removed = attachments.find((attachment) => attachment.id === id);
      if (removed?.kind === "image") releaseAttachmentImagePreview(removed);
      editAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    },
    [attachments, editAttachments],
  );
  const displayPasteInChatBox = useCallback(
    function displayPasteInChatBox(attachment: PasteAttachment) {
      const nextText = appendPastedText(text, attachment.text);
      editText(nextText);
      editAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      setCaret(nextText.length);
      setDismissedAt(null);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(nextText.length, nextText.length);
      });
    },
    [text, editText, editAttachments],
  );
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [dismissedSlashAt, setDismissedSlashAt] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const caretRef = useRef(0);
  caretRef.current = caret;
  const refocusInput = useCallback(() => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input || input.disabled || !composerShouldRefocus(document.activeElement, input)) return;
      const at = Math.min(caretRef.current, input.value.length);
      input.focus();
      input.setSelectionRange(at, at);
    });
  }, []);
  // Touch screens are skipped: focusing there pops the on-screen keyboard over the conversation.
  useEffect(() => {
    if (window.matchMedia?.("(hover: none) and (pointer: coarse)").matches) return;
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input || input.disabled || !composerTakesFocusOnOpen(document.activeElement, input)) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const replyToId = replyTo?.id ?? null;
  const focusedReplyRef = useRef(replyToId);
  useEffect(() => {
    const previous = focusedReplyRef.current;
    focusedReplyRef.current = replyToId;
    if (!replyTargetTakesFocus(previous, replyToId)) return;
    if (window.matchMedia?.("(hover: none) and (pointer: coarse)").matches) return;
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input || input.disabled || !composerTakesFocusOnOpen(document.activeElement, input)) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [replyToId]);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  const botSupportsImages = (candidate?: Bot) =>
    Boolean(
      candidate &&
        state.instances.find((i) => i.instanceId === candidate.modelSelection.instanceId)?.capabilities?.images,
    );
  const imageTargetsSupport = (_message: string, _mode: "chat" | "goal") => botSupportsImages(bot);
  const effectiveText = text;
  const engineSupportsImages = imageTargetsSupport(effectiveText, "chat");

  const slash = composerSlashTrigger(text, caret);
  const locale = activeLocale();
  const slashSkills = useSlashSkills(bot?.id, Boolean(slash) && slash?.start !== dismissedSlashAt);
  const commandCandidates = useMemo(() => {
    if (!slash || slash.start === dismissedSlashAt) return [];
    const supportsAgents = (candidate?: Bot) =>
      Boolean(
        candidate &&
          state.instances.find(
            (instance) => instance.instanceId === candidate.modelSelection.instanceId,
          )?.capabilities?.agentsMcp,
      );
    const available: ComposerSlashCommand[] = [];
    if (
      skillAuthoringEnabled(state.config) &&
      supportsAgents(bot)
    ) {
      available.push({
        kind: "command",
        id: "learn",
        label: "/learn",
        description: t("composer.command.learnDesc"),
      });
    }
    if (supportsAgents(bot)) available.push({
      kind: "command",
      id: "setup",
      label: "/setup",
      description: t("composer.command.setupDesc"),
    });
    available.push(...skillSlashCommands(slashSkills));
    return available.filter((command) => slashCommandMatches(command, slash.query));
  }, [slash, dismissedSlashAt, bot, state.config, state.instances, locale, slashSkills]);
  const commandPickerOpen = commandCandidates.length > 0;

  const mention = mentionQueryAt(text, caret);
  const candidates = useMemo(() => {
    if (!mention || mention.start === dismissedAt) return [];
    const pool: MentionChoice[] = state.bots
      .filter((member) => member.id !== bot?.id && !member.hidden)
      .map((member) => ({ id: member.id, name: member.name, bot: member }));
    return mentionChoicesForQuery(pool, mention.query);
  }, [mention, dismissedAt, state.bots, bot?.id]);
  const mentionPickerOpen = candidates.length > 0;
  const commandMotion = useMenuMotion(commandPickerOpen);
  const mentionMotion = useMenuMotion(mentionPickerOpen);

  useEffect(
    () => setHighlight(0),
    [mention?.start, mention?.query, slash?.start, slash?.query],
  );

  useEffect(() => {
    if (!commandPickerOpen) return;
    setHighlight((current) => Math.min(current, commandCandidates.length - 1));
  }, [commandCandidates.length, commandPickerOpen]);

  useEffect(() => {
    if (!commandPickerOpen) return;
    commandListRef.current
      ?.querySelector<HTMLElement>(`[data-command-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, commandPickerOpen]);

  useEffect(() => {
    if (!mentionPickerOpen) return;
    mentionListRef.current
      ?.querySelector<HTMLElement>(`[data-mention-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, mentionPickerOpen]);

  const pickMention = (peer: MentionChoice) => {
    if (!mention) return;
    const after = text.slice(caret);
    const next = `${text.slice(0, mention.start)}@${peer.name} ${after}`;
    editText(next);
    const newCaret = mention.start + peer.name.length + 2;
    setCaret(newCaret);
    setDismissedAt(mention.start);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCaret, newCaret);
    });
  };

  const pickCommand = (command: ComposerSlashCommand | undefined) => {
    if (!slash || !command) return;
    const replacement = command.kind === "skill" ? `${command.label} `
      : command.id === "learn" ? "/learn " : command.id === "setup" ? "/setup " : "";
    const next = replaceComposerSlashTrigger(text, slash, replacement);
    editText(next.text);
    setCaret(next.caret);
    setDismissedSlashAt(slash.start);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const pendingCount = (state.pendingQueued[threadId] ?? []).length;
  const queuedMessages = state.pendingQueued[threadId] ?? [];
  const canSteerQueued = composerCanSteerQueuedMessages(
    busy,
    locked,
    pendingCount,
    Boolean(approval),
  );
  const [steering, setSteering] = useState(false);
  const interruptTurn = () => {
    if (bot) dispatch({ type: "interrupt", botId: bot.id, threadId });
  };
  const queueHeadId = queuedMessages[0]?.queueId;
  const steerQueued = () => {
    if (!queueHeadId) return;
    setSteering(true);
    const settle = () => setSteering(false);
    if (bot && canSteer) {
      dispatch({ type: "steerQueued", botId: bot.id, threadId, queueId: queueHeadId, onError: settle, onSettled: settle });
    } else if (bot) {
      dispatch({ type: "interrupt", botId: bot.id, threadId, onError: settle });
    }
  };
  useEffect(() => setSteering(false), [threadId, queueHeadId]);
  // Only a confirmed removal hands the words back, so a message that already drained into a turn is never resent.
  const editQueued = (queueId: string) => {
    const queued = queuedMessages.find((item) => item.queueId === queueId);
    if (!queued) return;
    const targetDraftId = draftId;
    const onCancelled = () => {
      const cited = splitTranscriptCitations(queued.text);
      if (cited.display) prependComposerDraft(targetDraftId, cited.display);
      appendDraftAttachments(targetDraftId, cited.citations);
      if (targetDraftId !== draftIdRef.current) return;
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(cited.display.length, cited.display.length);
      });
    };
    if (bot) dispatch({ type: "cancelQueued", botId: bot.id, threadId, queueId, onCancelled });
  };
  const steerAgainUntilRef = useRef(0);
  const prevPendingCountRef = useRef(pendingCount);
  useEffect(() => {
    const expiresAt = doubleEnterSteerWindowExpiresAt(
      prevPendingCountRef.current,
      pendingCount,
      busy,
      canSteer,
    );
    if (expiresAt !== null) steerAgainUntilRef.current = expiresAt;
    prevPendingCountRef.current = pendingCount;
  }, [pendingCount, busy, canSteer]);
  useEffect(() => {
    if (!busy || pendingCount === 0) {
      setSteering(false);
      return;
    }
    if (!steering) return;
    const timeout = window.setTimeout(() => setSteering(false), 20_000);
    return () => window.clearTimeout(timeout);
  }, [busy, pendingCount, steering]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [approvalWarning, setApprovalWarning] = useState<{
    mode: "auto";
    botId: string;
    threadId: string;
  } | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const modeBot = bot;
  const approvalEngine = modeBot
    ? state.instances.find((instance) => instance.instanceId === modeBot.modelSelection.instanceId)
    : undefined;
  const trustedThreadAccess = Boolean(!remoteClient && window.ogb?.approvals && capabilities.host.packaged);
  const uploadImage = useCallback(async (file: File): Promise<Attachment | null> => {
    const optimistic = optimisticImageAttachment(file);
    if (!optimistic) return null;
    appendDraftAttachments(draftId, [optimistic]);
    try {
      const completed = await imageAttachmentFromFile(file, optimistic);
      if (!completed) {
        replaceDraftAttachment(draftId, optimistic.id, null);
        releaseAttachmentImagePreview(optimistic);
        return null;
      }
      handoffAttachmentImagePreview(completed.path, completed.previewUrl);
      if (!replaceDraftAttachment(draftId, optimistic.id, completed)) {
        releaseAttachmentImagePreview(completed);
      }
      return null;
    } catch (error) {
      replaceDraftAttachment(draftId, optimistic.id, null);
      releaseAttachmentImagePreview(optimistic);
      throw error;
    }
  }, [draftId]);
  const pickFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    changeDraftAttachmentPending(draftId, true);
    try {
      const { attachments: added, notice } = await intakeFiles(Array.from(picked), {
        allowImages: engineSupportsImages,
        getPath: pathForFile,
        uploadImage,
      });
      if (added.length) addAttachments(added);
      if (notice) setAttachmentNotice(notice);
    } finally {
      changeDraftAttachmentPending(draftId, false);
    }
    refocusInput();
  };
  const setApprovalMode = (mode: ApprovalMode) => {
    if (!modeBot || modeBot.busy || mode === approvalModeFor(modeBot)) return;
    if (mode === "custom" && !trustedThreadAccess) return;
    if (mode === "auto" && modeBot.computer === "local") {
      setApprovalWarning({ mode: "auto", botId: modeBot.id, threadId: modeBot.threadId });
      return;
    }
    dispatch({ type: "updateTask", botId: modeBot.id, threadId: modeBot.threadId, patch: { approvalMode: mode } });
  };

  const hasContent = Boolean(effectiveText.trim()) || attachments.length > 0;
  const retryFailedSend = (failed: FailedComposerSend) => {
    if (failed.requestText.includes("<attached-image ") && !imageTargetsSupport(failed.requestText, "chat")) {
      dispatch({ type: "error", message: t("composer.error.noImages") });
      return;
    }
    forgetFailedComposerSend(draftId, failed.id);
    const retry = {
      sendId: failed.sendId,
      text: failed.requestText,
      replyToId: failed.replyToId,
      threadId: failed.threadId,
      onError: () => {
        rememberFailedComposerSend(draftId, {
          sendId: failed.sendId,
          text: failed.text,
          requestText: failed.requestText,
          replyToId: failed.replyToId,
          threadId: failed.threadId,
          channelMode: failed.channelMode,
        });
      },
    };
    if (bot) {
      dispatch({ type: "send", botId: bot.id, ...retry });
    }
  };
  const send = () => {
    if (locked || attachmentPending) return;
    if (
      attachments.some((attachment) => attachment.kind === "image") &&
      !imageTargetsSupport(effectiveText, "chat")
    ) {
      dispatch({ type: "error", message: t("composer.error.noImages") });
      return;
    }
    const composed = composeMessage(serializeThreadRefs(effectiveText, threads, currentBotId), attachments);
    if (!composed) return;
    const body = restoredRequestText(draftId) ?? composed;
    const sentDraft: ComposerDraftSnapshot = {
      draftId,
      revision: draftRevision(draftId),
      sendId: restoredSendId(draftId) ?? crypto.randomUUID(),
      text,
      requestText: body,
      attachments: [...attachments],
      reply: replyTo ?? null,
      replyToId: replyTo?.id,
      threadId,
      channelMode: undefined,
    };
    if (bot) {
      dispatch({
        type: "send",
        botId: bot.id,
        text: body,
        sendId: sentDraft.sendId,
        replyToId: replyTo?.id,
        threadId,
        onError: () => restoreDraft(sentDraft),
      });
      directMessageSent(state.instances, bot.modelSelection?.instanceId, busy && !canSteer);
    }
    setText("");
    setAttachments([]);
    onConsumeReply?.();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = clipboardImageFiles(e.clipboardData);
    if (imageFiles.length > 0 || clipboardHasImages(e.clipboardData)) {
      e.preventDefault();
      if (!engineSupportsImages) {
        dispatch({
          type: "error",
          message: t("composer.error.noImages"),
        });
        return;
      }
      if (!imageFiles.length) {
        dispatch({ type: "error", message: t("composer.error.clipboardImage") });
        return;
      }
      if (imageFiles.length > 0) {
        changeDraftAttachmentPending(draftId, true);
        void (async () => {
          try {
            const results = await Promise.allSettled(imageFiles.map(uploadImage));
            for (const result of results) {
              if (result.status === "rejected") {
                dispatch({
                  type: "error",
                  message: result.reason instanceof Error ? result.reason.message : "image upload failed",
                });
              }
            }
          } finally {
            changeDraftAttachmentPending(draftId, false);
          }
        })();
        return;
      }
    }
    const pasted = e.clipboardData.getData("text/plain");
    const reference = threadTokenFromPaste(pasted, threads, currentBotId);
    if (reference) {
      e.preventDefault();
      const start = e.currentTarget.selectionStart ?? text.length;
      const end = e.currentTarget.selectionEnd ?? start;
      const { lead, trail } = threadTokenSpacing(text, start, end);
      const token = lead + reference.token + trail;
      editText(text.slice(0, start) + token + text.slice(end));
      const at = start + token.length;
      setCaret(at);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(at, at);
      });
      return;
    }
    if (!isLongPaste(pasted)) return;
    e.preventDefault();
    const start = e.currentTarget.selectionStart;
    const end = e.currentTarget.selectionEnd;
    if (start !== end) {
      editText(`${text.slice(0, start)}${text.slice(end)}`);
      setCaret(start);
    }
    editAttachments((prev) => [...prev, pasteAttachment(pasted)]);
  };

  const approvalChoice = modeBot && approvalEngine && !remoteClient ? {
    approvalMode: modeBot.approvalMode,
    autoApprove: modeBot.autoApprove,
    providerName: approvalEngine.displayName,
    driverKind: approvalEngine.driverKind,
    onSelect: setApprovalMode,
    disabled: Boolean(modeBot.busy),
    trustedModesAvailable: trustedThreadAccess,
  } : undefined;

  return (
    <div className="pointer-events-none relative px-5 pb-3">
      
      <div className="pointer-events-auto relative w-full">
        {failedSends.map((failed) => (
          <div
            key={failed.id}
            className="mb-2 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] text-danger"
          >
            <span className="min-w-0 flex-1 truncate">
              {t("composer.failed.notSent", {
                text: failed.text.trim() || t("composer.failed.attachment"),
              })}
            </span>
            <button
              type="button"
              onClick={() => retryFailedSend(failed)}
              className="shrink-0 rounded px-2 py-1 font-medium hover:bg-danger/10"
            >
              {t("chat.retry")}
            </button>
            <button
              type="button"
              onClick={() => forgetFailedComposerSend(draftId, failed.id)}
              aria-label={t("composer.failed.dismissAria")}
              title={t("composer.failed.dismiss")}
              className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-danger/10"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>
        ))}
        {commandMotion.shown && (
          <div
            ref={commandListRef}
            role="listbox"
            aria-label={t("composer.commands.aria")}
            className={cn("absolute bottom-full left-2 z-20 mb-2 max-h-80 w-80 max-w-[calc(100%-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-hairline/40 bg-raised shadow-lg", commandMotion.className)} {...commandMotion.exitProps}
          >
            <div className="border-b border-hairline/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
              {t("composer.commands.title")}
            </div>
            {commandCandidates.map((command, index) => (
              <button
                key={`${command.kind}:${command.id}`}
                data-command-index={index}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickCommand(command)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                  index === highlight ? "bg-raised-hover" : "",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  {command.kind === "skill" ? (
                    <Sparkles size={15} aria-hidden="true" />
                  ) : command.id === "goal" ? (
                    <Target size={15} aria-hidden="true" />
                  ) : (
                    <BookOpen size={15} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-accent">{command.label}</span>
                    {command.kind === "skill" && (
                      <span className="shrink-0 rounded-full bg-accent/10 px-1.5 text-[11px] font-medium leading-4 text-accent">{t("composer.command.skillTag")}</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-ink-secondary">
                    {command.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {mentionMotion.shown && (
          <div
            ref={mentionListRef}
            role="listbox"
            aria-label={t("composer.mention.aria")}
            className={cn("absolute bottom-full start-2 z-20 mb-2 max-h-72 w-72 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-hairline/40 bg-raised shadow-lg", mentionMotion.className)} {...mentionMotion.exitProps}
          >
            {candidates.map((peer, i) => {
              const description = peer.bot?.title?.trim() ?? "";
              return (
                <ComposerMenuRow
                  key={peer.id}
                  id={`composer-mention-${peer.id}`}
                  data-mention-index={i}
                  role="option"
                  aria-selected={i === highlight}
                  onClick={() => pickMention(peer)}
                  onMouseEnter={() => setHighlight(i)}
                  selected={i === highlight}
                  icon={peer.bot ? (
                    <BotAvatar
                      bot={peer.bot}
                      size={24}
                    />
                  ) : (
                    <span className="flex size-6 items-center justify-center rounded-full bg-raised text-ink-secondary">
                      <Users size={14} aria-hidden="true" />
                    </span>
                  )}
                  name={peer.name}
                  description={description || undefined}
                  kind={peer.bot ? t("composer.mention.agent") : t("composer.mention.channel")}
                />
              );
            })}
          </div>
        )}
        {approval && (
          <div className="mb-2 overflow-hidden rounded-3xl bg-composer ring-1 ring-composer-ring">
            <PendingApprovalPanel
              key={approval.requestId}
              pending={approval}
              botName={approvalBot?.name}
              count={approvals.length}
              index={0}
              locale={activeLocale()}
              actions={<PendingApprovalActions part="primary" pending={approval} threadId={threadId} bot={approvalBot} onCancelTurn={interruptTurn} />}
              more={<PendingApprovalActions part="more" pending={approval} threadId={threadId} bot={approvalBot} onCancelTurn={interruptTurn} />}
            />
          </div>
        )}
        <ComposerAttachments
          items={attachments}
          onAdd={addAttachments}
          onRemove={removeAttachment}
          onChangeCitation={(citation: CitationAttachment) => editAttachments((current) => current.map((attachment) => attachment.id === citation.id ? citation : attachment))}
          onDisplayInChatBox={displayPasteInChatBox}
          allowImages={engineSupportsImages}
          notice={attachmentNotice}
          onNotice={setAttachmentNotice}
          onPendingChange={(pending) => changeDraftAttachmentPending(draftId, pending)}
          uploadImage={uploadImage}
        />
        <QueuedComposerMessages
          items={queuedMessages}
          onSteer={canSteerQueued ? steerQueued : undefined}
          steerInterrupts={!canSteer}
          steerMode="all"
          steering={steering}
          onCancel={(queueId) => {
            if (bot) dispatch({ type: "cancelQueued", botId: bot.id, threadId, queueId });
          }}
          onEdit={locked ? undefined : editQueued}
        />
        <div className="relative">
          {<div
            aria-hidden
            data-composer-backdrop
            className="pointer-events-none absolute -left-5 -right-5 -bottom-3 top-1/2 bg-app"
          />}
        <div data-tour="composer" className="@container/composer relative z-[1] rounded-3xl bg-composer px-2 py-1.5 ring-1 ring-composer-ring">
        {replyTo && <ComposerReplyStrip message={replyTo} fallbackName={bot?.name} onClear={onClearReply} />}
        <div data-composer-row className="flex items-end gap-1 @max-[30rem]/composer:flex-wrap">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void pickFiles(e.target.files);
              // Reset so picking the same file again still fires onChange.
              e.target.value = "";
            }}
          />
          {!locked && (
            <div className="flex flex-wrap items-center gap-1">
              
              {<button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label={t("composer.attach")}
                title={t("composer.attach")}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-control hover:text-ink"
              >
                <Paperclip size={17} />
              </button>}
              {(approvalChoice) && <ApprovalModeSelector {...approvalChoice} />}
            </div>
          )}
          <MentionTextarea
          wrapperClassName="@max-[30rem]/composer:order-first @max-[30rem]/composer:basis-full"
          inputRef={inputRef}
          peers={state.bots.filter((member) => member.id !== bot?.id)}
          everyone={false}
          dir="auto"
          rows={1}
          value={text}
          onChange={(e) => {
            editText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setDismissedAt(null);
            setDismissedSlashAt(null);
          }}
          onPaste={handlePaste}
          onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            // An input method's confirming Enter and arrows pick its own candidates, not a mention or command.
            if (imeComposing(e.nativeEvent)) return;
            if (commandPickerOpen) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const delta = e.key === "ArrowDown" ? 1 : -1;
                setHighlight((current) =>
                  (current + delta + commandCandidates.length) % commandCandidates.length,
                );
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pickCommand(commandCandidates[highlight]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDismissedSlashAt(slash?.start ?? null);
                return;
              }
            }
            if (mentionPickerOpen) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const delta = e.key === "ArrowDown" ? 1 : -1;
                setHighlight((h) => (h + delta + candidates.length) % candidates.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pickMention(candidates[highlight]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDismissedAt(mention?.start ?? null);
                return;
              }
            }
            if (onClearReply && escapeCancelsReply(e.nativeEvent, { replying: Boolean(replyTo) })) {
              e.preventDefault();
              onClearReply();
              return;
            }
            if (e.key === "ArrowUp" && !hasContent && onEditLast) {
              e.preventDefault();
              onEditLast();
              return;
            }
            if (sendsMessage(e.nativeEvent, sendKey)) {
              e.preventDefault();
              if (
                canSteer &&
                doubleEnterSteersQueue(steerAgainUntilRef.current, Date.now(), pendingCount, hasContent)
              ) {
                steerAgainUntilRef.current = 0;
                steerQueued();
                return;
              }
              send();
            }
          }}
          // Not disabled during an upload: a disabled element drops keyboard focus for good. send() refuses while one
          // is pending.
          disabled={Boolean(approval) || locked}
          aria-busy={bot?.awaitingThreadSnapshot || undefined}
          placeholder={
            setupLocked
              ? t("composer.placeholder.locked")
              : approval
              ? t("composer.placeholder.approval")
              : attachmentPending
              ? t("composer.placeholder.attaching")              : replyTo && !busy
              ? t("composer.placeholder.reply")
              : busy && canSteer
                ? pendingCount > 0
                  ? t("composer.placeholder.steerQueued", { name: busyName, key: sendLabel })
                  : t("composer.placeholder.steer", { name: busyName, key: sendLabel })
              : busy
                ? t("composer.placeholder.queue", { name: busyName })
                : t("composer.placeholder.bot", { name: bot?.name ?? "" })
          }
          aria-label={t("composer.placeholder.bot", { name: bot?.name ?? "" })}
            className="block max-h-[9rem] min-h-6 w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-[15px] leading-6 placeholder:text-ink-secondary focus:outline-none"
          />
          <div data-composer-actions className="flex items-center gap-1 @max-[30rem]/composer:ml-auto">
          {busy && !locked && (
          <button
            onClick={interruptTurn}
            aria-label={t("chat.stopTurn")}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink"
            title={t("chat.stop")}
          >
            <Square size={14} className="fill-current" />
          </button>
        )}

        {!locked && (
          <button
            onClick={send}
            disabled={!hasContent || attachmentPending}
            aria-label={
              busy && canSteer
                  ? t("composer.send.steer")
                  : busy
                    ? t("composer.send.queue")
                    : t("composer.send.message")
            }
            title={
              busy && canSteer
                  ? t("composer.send.steer")
                  : busy
                    ? t("composer.send.queueHint")
                    : `${t("chat.send")} (${sendLabel})`
            }
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-40",
              busy && !canSteer
                  ? "bg-raised text-ink-secondary hover:bg-raised-hover"
                  : "bg-accent hover:brightness-110",
            )}
          >
            {busy && !canSteer ? <Clock size={15} /> : <ArrowUp size={17} />}
          </button>
          )}
          </div>
        </div>
        </div>
        </div>
      </div>
      <div className="pointer-events-auto">
      <LocalComputerAutoWarning
        open={approvalWarning?.mode === "auto"}
        onCancel={() => setApprovalWarning(null)}
        onConfirm={() => {
          if (approvalWarning?.mode === "auto") {
            dispatch({
              type: "updateTask",
              botId: approvalWarning.botId,
              threadId: approvalWarning.threadId,
              patch: { approvalMode: "auto", acknowledgeLocalAuto: true },
            });
          }
          setApprovalWarning(null);
        }}
      />
      </div>
    </div>
  );
}
