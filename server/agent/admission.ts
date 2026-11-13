// Purity is the contract: no IO, no store reads, no adapter calls. Callers gather state, call admit(), and apply the decision.

export type AdmissionSurface =
  | "direct-busy" // 1:1 send to a thread whose turn is live: steer-first
  | "direct" // 1:1 send on a settled thread: start now or park
  | "guarded" // guarded external send: refuse when anything is busy
  | "unattended" // routines: busy means a missed run
  | "peer" // delegations and resume drains: slot-aware admission
  | "incident"; // a report to the Chief's incidents thread: never refused

export type AdmissionQueueReason = "capacity";

export type AdmissionRefusalCode = "guarded_busy" | "busy" | "missing";

export const DRAIN_COALESCE_WINDOW_MS = 120_000;

/** The first item always drains, so an empty identity never strands a queue. */
export function drainCoalesceHead<T>(
  items: readonly T[],
  identityOf: (item: T) => string,
  queuedAtOf: (item: T) => number,
): T[] {
  const head: T[] = [];
  let previousIdentity: string | undefined;
  let previousAt: number | undefined;
  for (const item of items) {
    const identity = identityOf(item);
    const at = queuedAtOf(item);
    const gap = at - (previousAt ?? at);
    if (head.length === 0 || (identity === previousIdentity && gap >= 0 && gap <= DRAIN_COALESCE_WINDOW_MS)) {
      head.push(item);
    } else {
      break;
    }
    previousIdentity = identity;
    previousAt = at;
  }
  return head;
}

export interface AdmissionMessage {
  carriesImages?: boolean;
  engineCanSteerImages?: boolean;
  /** Steering into a turn waiting on a person's surface choice would race the choice. */
  pendingComputerSelection?: boolean;
  engineCanSteer?: boolean;
}

export interface AdmissionState {
  botPresent?: boolean;
  /** Broader than threadBusy: guarded sends refuse on it, ordinary sends do not. */
  botBusy?: boolean;
  threadBusy?: boolean;
  atCapacity?: boolean;
  parksBehindCoordination?: boolean;
}

export type AdmissionSteerBlock = "images";

export type AdmissionDecision =
  | { action: "steer" }
  | { action: "queue"; reason?: AdmissionQueueReason; blockedBy?: AdmissionSteerBlock }
  | { action: "start" }
  | { action: "refuse"; code: AdmissionRefusalCode };

function imagesBlockSteer(message: AdmissionMessage): boolean {
  return message.carriesImages === true && message.engineCanSteerImages !== true;
}

export function admit(
  surface: AdmissionSurface,
  message: AdmissionMessage = {},
  state: AdmissionState = {},
): AdmissionDecision {
  switch (surface) {
    case "direct-busy": {
      if (message.engineCanSteer !== true || message.pendingComputerSelection) return { action: "queue" };
      if (imagesBlockSteer(message)) return { action: "queue", blockedBy: "images" };
      return { action: "steer" };
    }
    case "direct": {
      if (state.atCapacity || state.threadBusy || state.parksBehindCoordination) {
        return { action: "queue", reason: state.atCapacity ? "capacity" : undefined };
      }
      return { action: "start" };
    }
    case "guarded": {
      // A guarded send is an external contract: never queued, never steered, never started under stale permissions.
      if (state.botBusy || state.threadBusy || state.atCapacity || state.parksBehindCoordination) {
        return { action: "refuse", code: "guarded_busy" };
      }
      return { action: "start" };
    }
    case "unattended": {
      if (state.botPresent === false) return { action: "refuse", code: "missing" };
      if (state.atCapacity) return { action: "refuse", code: "busy" };
      return { action: "start" };
    }
    case "peer": {
      if (state.threadBusy || state.atCapacity) return { action: "refuse", code: "busy" };
      return { action: "start" };
    }
    case "incident": {
      // Never refused (a refused report is a lost one), never parked behind handed-on work, never steered.
      if (state.atCapacity || state.threadBusy) {
        return { action: "queue", reason: state.atCapacity ? "capacity" : undefined };
      }
      return { action: "start" };
    }
  }
}
