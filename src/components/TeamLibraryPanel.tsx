import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BookOpen, CalendarClock, Check, Crown, Loader2, MessageSquare, NotebookPen, Plug, Users, UploadCloud, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { teamImportPreview, type PendingTeamImport } from "@/lib/team-import";
import { api, useStore, type Bot, type Group } from "@/state/store";
import type { Routine } from "@/lib/routines";
import { MAX_TEAM_BACKUP_BYTES } from "../../shared/team-backup";
import { takeImportName } from "../../shared/import-name";

export interface TeamImportResult {
  name: string;
  members: number;
  presets?: number;
  connections?: number;
}

const TEAM_GLYPHS = [
  "bg-purple-500/15 text-purple-300",
  "bg-cyan-500/15 text-cyan-300",
  "bg-orange-500/15 text-orange-300",
  "bg-emerald-500/15 text-emerald-300",
] as const;

export function TeamImportDetails({ pending, importedNames, org = false }: {
  pending: PendingTeamImport;
  importedNames: string[];
  org?: boolean;
}) {
  return (
    <>
      {pending.description && (
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink-secondary">{pending.description}</p>
      )}
      {pending.brief && (
        <div className="mt-4 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-secondary">
          <div className="font-medium text-ink">{t("teamImport.brief")}</div>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words">{pending.brief}</p>
        </div>
      )}
      {Boolean(pending.warnings?.length) && <div className="mt-4 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-secondary">
        <div className="mb-2 font-medium text-ink">{t("templates.backupNotes")}</div>
        {pending.warnings?.map((warning, index) => <p key={index}>{warning}</p>)}
      </div>}
      {(pending.kind === "package" || pending.kind === "backup") && (
        <div className="mt-5 flex flex-wrap gap-2 text-[11.5px] text-ink-secondary">
          {pending.chiefOfStaff && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><Crown size={13} />{t("templates.leads", { name: pending.chiefOfStaff })}</span>}
          {!pending.library && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><MessageSquare size={13} />{t("templates.groups", { count: pending.groups })}</span>}
          {!(pending.library && !pending.playbooks) && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><BookOpen size={13} />{t("templates.playbooks", { count: pending.playbooks })}</span>}
          {!pending.library && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><CalendarClock size={13} />{pending.version === 2 ? t("teamImport.routinesPaused", { count: pending.routines }) : t("templates.pausedRoutines", { count: pending.routines })}</span>}
          {pending.kind === "package" && pending.version !== 2 && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><Plug size={13} />{t("templates.connections", { count: pending.apps.length })}</span>}
          {Boolean(pending.connections?.length) && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><Plug size={13} />{t("teamImport.connections", { count: pending.connections?.length ?? 0 })}</span>}
          {Boolean(pending.notes) && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><NotebookPen size={13} />{t("teamImport.notes", { count: pending.notes ?? 0 })}</span>}
          {Boolean(pending.presets?.length) && <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5"><Users size={13} />{t("teamImport.presets", { count: pending.presets?.length ?? 0 })}</span>}
        </div>
      )}
      {Boolean(pending.skills?.length) && (
        <div className="mt-4 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-secondary">
          <div className="font-medium text-ink">{org ? t("orgLibrary.skillsOn") : pending.version === 2 ? t("teamImport.skillsOff") : t("templates.skillsDisabled")}</div>
          <p className="mt-1 break-words">{pending.skills?.join(", ")}</p>
          {!org && <p className="mt-1">{pending.version === 2 ? t("teamImport.skillsReview") : t("templates.skillsReview")}</p>}
        </div>
      )}
      {pending.library && Boolean(pending.presets?.length) && (
        <div className="mt-4 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-secondary">
          <div className="font-medium text-ink">{t("teamImport.presetList")}</div>
          <p className="mt-1 break-words">{pending.presets?.join(", ")}</p>
        </div>
      )}
      {Boolean(pending.offeredSkills?.length) && (
        <div className="mt-4 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-secondary">
          <div className="font-medium text-ink">{t("teamImport.offeredSkills")}</div>
          <p className="mt-1 break-words">{pending.offeredSkills?.join(", ")}</p>
        </div>
      )}
      {Boolean(pending.connections?.length) && (
        <div className="mt-4 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-secondary">
          <div className="font-medium text-ink">{t("teamImport.connections", { count: pending.connections?.length ?? 0 })}</div>
          <ul className="mt-1">
            {pending.connections?.map((connection, index) => (
              <li key={`${connection.label}-${index}`} className="truncate">{connection.label} · {connection.url}</li>
            ))}
          </ul>
        </div>
      )}
      {pending.members.length > 0 && <div className="mt-6 text-[12px] font-medium text-ink-secondary">{t("templates.teamMembers")}</div>}
      <div className="mt-2 grid grid-cols-1 gap-x-10 md:grid-cols-2">
        {pending.members.map((member, index) => (
          <div key={`${member.name}-${index}`} className="flex min-h-[72px] items-center gap-3 border-b border-hairline/35 px-1 py-3">
            {pending.pictures?.[index]
              ? <img src={pending.pictures[index]!} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
              : (
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold", TEAM_GLYPHS[index % TEAM_GLYPHS.length])}>
                  {member.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-ink">{importedNames[index]}</div>
              {importedNames[index] !== member.name && <div className="text-[11.5px] text-ink-secondary">{t("templates.newCopyOf", { name: member.name })}</div>}
              <div className="mt-0.5 truncate text-[12.5px] text-ink-secondary">{member.title || t("templates.generalAssistant")}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-raised/45 px-4 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
        <Check size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          {pending.kind === "backup"
            ? t("templates.backupSafety", { archived: pending.archivedBots ? t("templates.archivedBots", { count: pending.archivedBots }) : "" })
            : org
            ? pending.members.length ? t("orgLibrary.teamSafety") : t("orgLibrary.librarySafety")
            : pending.library
            ? t("teamImport.librarySafety")
            : pending.version === 2
            ? t("teamImport.sharedTeamSafety")
            : pending.kind === "package"
            ? t("templates.packageSafety")
            : t("templates.legacySafety")}
        </p>
      </div>
    </>
  );
}

export function TeamLibraryPanel({ onClose, onImported, returnFocusRef }: {
  onClose: () => void;
  onImported: (result: TeamImportResult) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { state, dispatch } = useStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingTeamImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const currentBotCount = state.bots.filter((bot) => !bot.hidden).length;
  const takenNames = new Set(state.bots.map((bot) => bot.name.trim().toLowerCase()));
  const importedNames = pending?.members.map((member) => takeImportName(member.name, takenNames)) ?? [];

  useEffect(() => {
    dialogRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [returnFocusRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !importing) {
        event.preventDefault();
        event.stopPropagation();
        if (pending) { setPending(null); setError(""); }
        else onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const items = Array.from(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((item) => item.getClientRects().length > 0);
      if (!dialog || items.length === 0) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && (document.activeElement === dialog || document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [importing, onClose, pending]);

  const readFile = async (file: File) => {
    if (file.size > MAX_TEAM_BACKUP_BYTES) throw new Error(t("templates.fileTooLarge"));
    const raw = await file.text();
    let manifest: unknown = raw;
    if (!file.name.toLowerCase().endsWith(".md")) {
      try { manifest = JSON.parse(raw); }
      catch (cause) {
        if (cause instanceof SyntaxError) throw new Error("That backup or team file is not valid JSON.");
        throw cause;
      }
    }
    setPending(teamImportPreview(manifest));
    setError("");
  };

  const importTeam = async () => {
    if (!pending) return;
    setImporting(true);
    setError("");
    try {
      // SAFETY: this endpoint is owned by the app and returns imported bots.
      const response = (await api("/api/teams/import?mode=add", {
        method: "POST",
        body: JSON.stringify(pending.manifest),
      })) as {
        bots: Bot[];
        groups?: Group[];
        routines?: Routine[];
        connections?: unknown[];
        presets?: unknown[];
      };
      for (const bot of response.bots) dispatch({ type: "botAdded", bot });
      for (const group of response.groups ?? []) dispatch({ type: "groupPatched", group });
      for (const routine of response.routines ?? []) dispatch({ type: "routinePatched", routine });
      const first = response.bots.find((bot) => !bot.hidden);
      if (first) dispatch({ type: "select", id: first.id });
      track("team_imported", { members: response.bots.length, source: "file", mode: "add", format: pending.kind });
      onImported({
        name: pending.name,
        members: response.bots.length,
        ...(response.connections?.length ? { connections: response.connections.length } : {}),
        ...(response.presets?.length ? { presets: response.presets.length } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && !importing && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="team-library-title" tabIndex={-1}
        className="animate-pop-in flex max-h-[calc(100dvh-2rem)] w-full max-w-[840px] flex-col overflow-hidden rounded-[24px] border border-hairline/50 bg-panel shadow-2xl shadow-black/50 outline-none">
        <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-6 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {pending && <button type="button" disabled={importing} onClick={() => { setPending(null); setError(""); }}
                aria-label={t("templates.back")} className="rounded-full p-1.5 text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-40">
                <ArrowLeft size={18} />
              </button>}
              <h2 id="team-library-title" className="truncate text-[19px] font-semibold text-ink">{pending ? pending.name : t("templates.title")}</h2>
            </div>
            {!pending && <p className="mt-1 text-[13px] text-ink-secondary">{t("templates.bringYourOwn")}</p>}
          </div>
          <button type="button" disabled={importing} onClick={onClose} aria-label={t("templates.close")}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 pb-6 pt-3 sm:px-8">
          {pending ? <TeamImportDetails pending={pending} importedNames={importedNames} /> : <>
            <input ref={fileInputRef} type="file" accept=".json,.md,application/json,text/markdown" className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readFile(file).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
              }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault(); setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void readFile(file).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
              }}
              className={cn("flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition-colors", dragging ? "border-accent bg-accent/5" : "border-hairline/60 bg-raised/20 hover:bg-raised/35")}>
              <UploadCloud size={27} className="text-accent" />
              <span className="mt-3 text-[14px] font-medium text-ink">{t("templates.chooseFile")}</span>
              <span className="mt-1 text-[12.5px] text-ink-secondary">{t("templates.dropFile")}</span>
            </button>
          </>}
          {error && <div role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
        </div>
        {pending && <footer className="flex flex-col gap-3 border-t border-hairline/35 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="text-[12.5px] text-ink-secondary">
            {t(currentBotCount === 0 ? "templates.existingNone" : currentBotCount === 1 ? "templates.existingOne" : "templates.existingMany", { count: currentBotCount })}
            {" "}{pending.kind === "backup" ? t("teamImport.backupCopies") : pending.library ? t("teamImport.libraryAdds")
              : pending.members.length === 0 ? "" : t("teamImport.newSection", { name: pending.teamName ?? pending.name })}
          </div>
          <button type="button" onClick={() => void importTeam()} disabled={importing}
            className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-medium text-white hover:bg-accent/90 disabled:opacity-60">
            {importing && <Loader2 size={15} className="animate-spin" />}
            {importing ? t("templates.importing") : pending.kind === "backup" ? t("templates.importBackup") : pending.library ? t("teamImport.addPresets") : t("templates.addTeam")}
          </button>
        </footer>}
      </div>
    </div>, document.body,
  );
}
