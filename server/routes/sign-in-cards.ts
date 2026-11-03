// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel|save-login) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel|save-login) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel|save-login) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
// POST /api/bots/<bot>/sign-in-cards/<message>/(done|cancel|save-login) with {threadId}, and GET .../save-login?threadId=
// for where a login saved from the card would fill. A saved password goes into the encrypted store and no route ever
// returns it.
import type { RequestAuth } from "../auth/request-auth.ts";
import { PASS, type RouteHandler } from "./table.ts";

export type SignInOutcome = "done" | "cancelled";

type Answer = { status: number; body: Record<string, unknown> };

export interface SignInCardRouteDeps {
  settle(botId: string, threadId: string, messageId: string, outcome: SignInOutcome): Answer;

  /** A member reaches a card only in a thread shown to them, which in a room can be narrower than the bot. */
  threadVisible(auth: RequestAuth, threadId: string): boolean;
}

const HIDDEN: Answer = { status: 404, body: { error: "no such sign-in request" } };

const CARD = /^\/api\/bots\/([\w-]+)\/sign-in-cards\/([\w-]+)\/(done|cancel|save-login)$/u;

export function createSignInCardRoutes(deps: SignInCardRouteDeps): RouteHandler {
  return async ({ req, res,  path, method, auth, json, readBody }) => {
    const m = CARD.exec(path);
    if (!m) return PASS;

    if (method !== "POST") return PASS;

    const body = await readBody(req);
    const threadId = String(body.threadId ?? "");
    const result = deps.threadVisible(auth, threadId) ? deps.settle(m[1]!, threadId, m[2]!, m[3] === "done" ? "done" : "cancelled") : HIDDEN;
    return json(res, result.status, result.body);
  };
}
