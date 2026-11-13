import type { WireBot, WireTask } from "../../shared/wire.ts";
import { ATTACHMENTS_DIR, extensionForMime, FILE_MAX_BYTES, IMAGE_MAX_BYTES, parseAudioRange, readAttachment, saveFile, saveImageUpload, validateAttachmentUploadId, type SavedAttachment } from "../workspace/attachments.ts";
import { deliveredCopy } from "../bots/bot-attachment.ts";
import { memberBot, type Viewer, type VisibleSet } from "../bots/bot-visibility.ts";
import type { ComputerControl } from "../computers/computer-control.ts";
import type { AppConfig } from "../config/config.ts";
import type { Coordinator } from "../teams/coordinator.ts";
import type { ModelSelection } from "../harness/contracts.ts";
import { listMessageFolder, messageAttachmentName, messageFileDisposition, messageFileDownloadName, messageFolderEntryName, messageImageTargetAt, messageReferencesFile, openMessageFile, openMessageFolderEntry, referencedFileName } from "../storage/message-file.ts";
import type { RequestAuth, ResolveOptions } from "../auth/request-auth.ts";
import type { queuedSteerSnapshot } from "../teams/steer-queue.ts";
import type { BotRecord, Message, Store, TaskRecord } from "../storage/store.ts";
import { createJobRoutes } from "./jobs.ts";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

export type MessagePage = { messages: Array<Message | Record<string, unknown>>; hasMore?: boolean; activeLeafId: string | null };

export interface ThreadRouteDeps {
  store: Pick<Store,
    | "activeLeaf" | "activePath" | "bot" | "botByThread" | "bots" | "messagesFor"
    | "onChange" | "sections" | "taskByThread" | "tasks">;
  coordinator: Pick<Coordinator, "job">;
  cfg: Pick<AppConfig, "profile">;
  sessions: ResolveOptions["sessions"];
  defaultPage: number;
  pageSize(raw: string | null): number | null | undefined;
  messagePage(threadId: string, limit: number | undefined, before?: string | null): MessagePage;
  messageWindow(threadId: string, messageId: string, limit: number): { messages: Array<Message | Record<string, unknown>>; hasMore: boolean } | null;
  publicBotQueuedMessages(): ReturnType<typeof queuedSteerSnapshot>;
  wireBot(bot: BotRecord): WireBot;
  wireTask(task: TaskRecord, botModel: ModelSelection): WireTask;
  botComputerControlSnapshot(botId: string): ReturnType<ComputerControl["snapshot"]>;
  messageFileRootsForThread(senderId: string, threadId: string): string[];
  viewerFor(auth: RequestAuth): Viewer;
  visibleTo(viewer: Viewer): VisibleSet;
}

export function createThreadRoutes(deps: ThreadRouteDeps): RouteHandler {
  const {store, cfg, sessions, defaultPage: DEFAULT_PAGE, pageSize, messagePage, messageWindow, publicBotQueuedMessages, wireBot, wireTask, botComputerControlSnapshot, messageFileRootsForThread, viewerFor, visibleTo} = deps;
  const jobs = createJobRoutes({ store, coordinator: deps.coordinator, viewerFor, visibleTo, sessions });
  const handle = async ({ req, res, url, path, method, auth, json, readBody }: RouteContext): Promise<unknown> => {
    let m: RegExpMatchArray | null = null;
    const visible = visibleTo(viewerFor(auth));
    if (method === "GET" && path === "/api/bots") {
      const limit = pageSize(url.searchParams.get("messages"));
      if (limit === null) return json(res, 400, { error: "messages must be a non-negative whole number" });
      // tasks stays explicit: clients expect [] where wireBot() would omit the key.
      const shownBots = store.bots.filter((bot) => visible.bot(bot.id));
      const queued = publicBotQueuedMessages();
      return json(res, 200, {
        bots: shownBots.map((bot) => memberBot({
          ...wireBot(bot),
          tasks: store.tasks(bot.id).map((task) => wireTask(task, bot.modelSelection)),
          ...messagePage(bot.threadId, limit),
        }, visible)),
        groups: store.groups.filter((group) => visible.group(group.id)).map((group) => ({
          id: group.id, name: group.name, memberIds: group.memberIds, createdAt: group.createdAt, section: group.section,
        })),
        botQueuedMessages: visible.everything ? queued : Object.fromEntries(Object.entries(queued).filter(([threadId]) => visible.thread(threadId))),
        sections: visible.sections(store.sections),
        computerControl: Object.fromEntries(
          shownBots.map((bot) => {
            const snapshot = botComputerControlSnapshot(bot.id);
            return [bot.id, { held: snapshot.held, helpReason: snapshot.helpReason, ...(snapshot.help ? { help: snapshot.help } : {}) }];
          }),
        ),
      });
    }

    m = path.match(/^\/api\/threads\/([\w-]+)\/messages$/);
    if (m && method === "GET") {
      const threadId = m[1];
      if (!store.botByThread(threadId)) {
        return json(res, 404, { error: "no such conversation" });
      }
      const limit = pageSize(url.searchParams.get("limit"));
      if (limit === null) return json(res, 400, { error: "limit must be a non-negative whole number" });
      const before = url.searchParams.get("before");
      const around = url.searchParams.get("around");
      if (before && around) return json(res, 400, { error: "before and around cannot be combined" });
      if (around) {
        const window = messageWindow(threadId, around, limit ?? DEFAULT_PAGE);
        if (!window) return json(res, 404, { error: "no such message" });
        return json(res, 200, { ...window, activeLeafId: store.activeLeaf(threadId) });
      }
      // An unknown cursor must not answer with the newest page: the client would paginate in a circle.
      if (before && !store.messagesFor(threadId).some((msg) => msg.id === before)) {
        return json(res, 404, { error: "no such message" });
      }
      return json(res, 200, { ...messagePage(threadId, limit ?? DEFAULT_PAGE, before), activeLeafId: store.activeLeaf(threadId) });
    }

    m = path.match(/^\/api\/threads\/([\w-]+)\/messages\/([\w-]+)\/image$/);
    if (m && method === "GET") {
      // messagesFor caches a ThreadState for any id it is handed, so unknown ids 404 first.
      if (!store.botByThread(m[1])) {
        return json(res, 404, { error: "no such conversation" });
      }
      const message = store.messagesFor(m[1]).find((msg) => msg.id === m![2]);
      if (!message?.png) return json(res, 404, { error: "no image on that message" });
      const bytes = Buffer.from(message.png, "base64");
      res.writeHead(200, {
        "content-type": message.mime ?? "image/png",
        "content-length": String(bytes.byteLength),
        "cache-control": "private, max-age=31536000, immutable",
      });
      return res.end(bytes);
    }

    // Only a file this exact stored message grants; deliberately not a general path reader.
    m = path.match(/^\/api\/threads\/([\w-]+)\/messages\/([\w-]+)\/file$/);
    const streamsMessageImage = Boolean(
      m && method === "GET" && url.searchParams.get("preview") === "1",
    );
    if (m && (method === "POST" || streamsMessageImage)) {
      if (method === "POST" && !String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      const threadId = m[1]!;
      const directBot = store.botByThread(threadId);
      if (!directBot) return json(res, 404, { error: "no such conversation" });

      const message = store.messagesFor(threadId).find((candidate) => candidate.id === m![2]);
      if (!message) return json(res, 404, { error: "no such message" });
      if (message.kind !== "text" || (!message.text && !message.attachments?.length)) {
        return json(res, 403, { error: "that message does not share this file" });
      }
      const messageText = message.text ?? "";
      const body = method === "POST" ? await readBody(req) : null;
      const rawReference = streamsMessageImage ? url.searchParams.get("ref") : null;
      if (streamsMessageImage && (!rawReference || !/^\d+$/.test(rawReference))) {
        return json(res, 400, { error: "ref must identify a rendered image" });
      }
      const href = method === "POST"
        ? (typeof body.path === "string" ? body.path : "")
        : messageImageTargetAt(messageText, Number(rawReference));
      if (!href) return json(res, 400, { error: "path is required" });

      let roots: string[];
      let downloadName: string | undefined;
      const botAttachment = message.role === "bot"
        ? message.attachments?.find((attachment) => attachment.path === href)
        : undefined;
      if (message.role === "user") {
        downloadName = messageAttachmentName(messageText, href) ?? undefined;
        if (!downloadName) {
          return json(res, 403, { error: "that message does not share this file" });
        }
        roots = [ATTACHMENTS_DIR];
      } else if (botAttachment) {
        downloadName = botAttachment.kind === "file" ? botAttachment.name : undefined;
        roots = [ATTACHMENTS_DIR];
      } else {
        if (!messageReferencesFile(messageText, href)) {
          return json(res, 403, { error: "that bot message does not link to this file" });
        }
        const senderId = directBot?.id ?? message.from?.botId;
        // Membership is not consulted: removing a bot must not break files it already shared.
        if (!senderId) {
          return json(res, 403, { error: "the file's bot author could not be verified" });
        }
        roots = messageFileRootsForThread(senderId, threadId);
      }

      const folderEntry = method === "POST" && body.entry !== undefined
        ? messageFolderEntryName(body.entry)
        : undefined;
      if (folderEntry === null) return json(res, 400, { error: "entry must be one file name" });
      let file: Awaited<ReturnType<typeof openMessageFile>>;
      try {
        file = folderEntry
          ? await openMessageFolderEntry(href, folderEntry, roots)
          : await openMessageFile(href, roots);
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        const status = (error as { status?: unknown } | null)?.status;
        const name = message.role === "bot" && !botAttachment && !folderEntry && (code === "outside_workspace" || status === 404)
          ? referencedFileName(href)
          : null;
        const copy = name ? deliveredCopy(store.messagesFor(threadId), message, name) : null;
        if (copy) {
          file = await openMessageFile(copy.path, [ATTACHMENTS_DIR]);
          downloadName = copy.name;
        } else {
          // Only a client that asks for listings gets one; older clients keep the 400.
          if (body?.listFolder !== true || folderEntry || code !== "directory") throw error;
          const listing = await listMessageFolder(href, roots);
          res.setHeader("x-openmausbot-folder", "1");
          res.setHeader("cache-control", "private, no-store");
          return json(res, 200, listing);
        }
      }
      if ((streamsMessageImage || botAttachment?.kind === "image") && !file.mime.startsWith("image/")) {
        await file.handle.close();
        return json(res, 415, { error: "only images can be previewed here" });
      }
      res.writeHead(200, {
        "content-type": file.mime,
        "content-length": String(file.bytes),
        ...(streamsMessageImage
          ? { "content-disposition": "inline" }
          : { "content-disposition": messageFileDisposition(messageFileDownloadName(downloadName, file.name)) }),
        "cache-control": streamsMessageImage ? "private, max-age=3600" : "private, no-store",
        "cdn-cache-control": "no-store",
        "cloudflare-cdn-cache-control": "no-store",
        pragma: "no-cache",
        vary: "Authorization",
        "x-content-type-options": "nosniff",
        ...(streamsMessageImage
          ? {
              "cross-origin-resource-policy": "same-origin",
              "referrer-policy": "no-referrer",
            }
          : {}),
      });
      if (file.bytes === 0) {
        await file.handle.close();
        return res.end();
      }
      const stream = file.handle.createReadStream({ start: 0, end: file.bytes - 1, autoClose: true });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
      return;
    }

    // Raw bytes, not base64 JSON; retrying a UUID uploadId returns the same committed path.
    if (method === "POST" && path === "/api/attachments") {
      let uploadId: string | undefined;
      try {
        uploadId = validateAttachmentUploadId(url.searchParams.get("uploadId") ?? undefined);
      } catch (error) {
        req.resume();
        throw error;
      }
      const rawType = Array.isArray(req.headers["content-type"]) ? req.headers["content-type"][0] : req.headers["content-type"];
      const mime = rawType?.split(";")[0]?.trim().toLowerCase();
      if (!mime || !extensionForMime(mime)) {
        return json(res, 400, { error: "content-type must be an image type" });
      }
      const rawLength = Array.isArray(req.headers["content-length"])
        ? req.headers["content-length"][0]
        : req.headers["content-length"];
      const declaredLength = rawLength === undefined ? undefined : Number(rawLength);
      if (declaredLength !== undefined && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
        req.resume();
        return json(res, 400, { error: "content-length must be a non-negative integer" });
      }
      if (declaredLength !== undefined && declaredLength > IMAGE_MAX_BYTES) {
        req.resume();
        return json(res, 413, { error: `image exceeds ${IMAGE_MAX_BYTES} bytes` });
      }
      const saved = await new Promise<SavedAttachment>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let received = 0;
        let settled = false;
        const fail = (status: number, msg: string) => {
          if (settled) return;
          settled = true;
          reject(Object.assign(new Error(msg), { status }));
        };
        req.on("data", (chunk: Buffer) => {
          if (settled) return;
          received += chunk.byteLength;
          if (received > IMAGE_MAX_BYTES) return fail(413, `image exceeds ${IMAGE_MAX_BYTES} bytes`);
          chunks.push(chunk);
        });
        req.on("end", async () => {
          if (settled) return;
          settled = true;
          try {
            resolve(await saveImageUpload(Buffer.concat(chunks), mime, uploadId));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
        req.on("error", (e) => fail(400, e instanceof Error ? e.message : String(e)));
      });
      return json(res, 201, saved);
    }

    // Raw bytes; a UUID uploadId is stable across retries, and the quota rejects rather than delete files old prompts reference.
    if (method === "POST" && path === "/api/files") {
      let uploadId: string | undefined;
      try {
        uploadId = validateAttachmentUploadId(url.searchParams.get("uploadId") ?? undefined);
      } catch (error) {
        req.resume();
        throw error;
      }
      const name = url.searchParams.get("name");
      if (!name) {
        req.resume();
        return json(res, 400, { error: "name is required" });
      }
      const rawType = Array.isArray(req.headers["content-type"])
        ? req.headers["content-type"][0]
        : req.headers["content-type"];
      const rawLength = Array.isArray(req.headers["content-length"])
        ? req.headers["content-length"][0]
        : req.headers["content-length"];
      const declaredLength = rawLength === undefined ? undefined : Number(rawLength);
      if (declaredLength !== undefined && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
        req.resume();
        return json(res, 400, { error: "content-length must be a non-negative integer" });
      }
      if (declaredLength !== undefined && declaredLength > FILE_MAX_BYTES) {
        req.resume();
        return json(res, 413, { error: `file exceeds ${FILE_MAX_BYTES} bytes` });
      }
      try {
        // Returning must not destroy the socket: the caller still sends the 4xx when the byte count crosses the limit.
        const chunks = req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>;
        const saved = await saveFile(chunks, name, rawType ?? "", { uploadId, expectedBytes: declaredLength });
        return json(res, 201, saved);
      } catch (error) {
        req.resume();
        throw error;
      }
    }

    // Bare attachment filenames and exact bundled portrait catalog names only.
    m = path.match(/^\/api\/attachments\/([\w.-]+)$/);
    if (m && method === "GET") {
      const attachment = readAttachment(m[1]!);
      if (!attachment) return json(res, 404, { error: "no such attachment" });
      const size = attachment.bytes.byteLength;
      // Visibility is decided per request, so the browser must never reuse one member's copy for another identity.
      const headers = {
        "content-type": attachment.mime,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      };
      if (attachment.mime.startsWith("audio/")) {
        const rawRange = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range;
        const range = parseAudioRange(rawRange, size);
        if (range.kind === "unsatisfiable") {
          res.writeHead(416, { ...headers, "content-range": `bytes */${size}` });
          return res.end();
        }
        if (range.kind === "range") {
          res.writeHead(206, {
            ...headers,
            "content-length": String(range.end - range.start + 1),
            "content-range": `bytes ${range.start}-${range.end}/${size}`,
          });
          return res.end(attachment.bytes.subarray(range.start, range.end + 1));
        }
      }
      res.writeHead(200, { ...headers, "content-length": String(size) });
      return res.end(attachment.bytes);
    }

    m = path.match(/^\/api\/threads\/([\w-]+)\/export$/);
    if (m && method === "GET") {
      const threadId = m[1];
      const bot = store.botByThread(threadId);
      if (!bot) return json(res, 404, { error: "no such conversation" });
      const format = url.searchParams.get("format") ?? "markdown";
      if (format !== "markdown" && format !== "json") {
        return json(res, 400, { error: "format must be markdown or json" });
      }
      const title = store.taskByThread(bot.id, threadId)?.title || bot.name;
      const filename = (title.replace(/[^\w\- ]+/g, "").trim() || "conversation").slice(0, 60);
      const messages = store.activePath(threadId);
      if (format === "json") {
        const slim = messages.map(({ png: _png, mime: _mime, ...rest }) => rest);
        res.writeHead(200, {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="${filename}.json"`,
        });
        return res.end(JSON.stringify({ name: title, threadId, messages: slim }, null, 2));
      }
      const userName = cfg.profile?.name?.trim() || "User";
      const lines: string[] = [`# ${title}`, ""];
      for (const msg of messages) {
        const sentBy = msg.sender?.name ?? userName;
        const who = msg.role === "user"
          ? msg.via === "api" ? `${sentBy} (via the local API)` : sentBy
          : (msg.from?.name ?? bot?.name ?? "Bot");
        if ((msg.kind === "text" || msg.kind === "widget") && msg.text) lines.push(`**${who}:**`, "", msg.text, "");
        else if (msg.kind === "activity" && msg.tool) lines.push(`> ${msg.tool.name}`, "");
        else if (msg.kind === "screen") lines.push("> [screen capture]", "");
        else if (msg.kind === "options" && msg.card) {
          lines.push(`> ${msg.card.title}${msg.card.answered ? ` — answered: ${msg.card.answered}` : ""}`, "");
        }
      }
      res.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.md"`,
      });
      return res.end(lines.join("\n"));
    }
    return PASS;
  };
  return async (ctx) => (await jobs(ctx) !== PASS || await handle(ctx) !== PASS ? undefined : PASS);
}
