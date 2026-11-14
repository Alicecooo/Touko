import type { AnyProviderDriver } from "../harness/contracts.ts";
import { AntigravityDriver } from "./antigravity.ts";
import { ClaudeDriver } from "./claude.ts";
import { CodexDriver } from "./codex.ts";
import { GrokAgentDriver } from "./acp/grok.ts";
import { CursorAgentDriver } from "./acp/cursor.ts";
import { OpenAICompatDriver } from "./openai-compat.ts";
import { OmpDriver, PiDriver } from "./pi.ts";

export const BUILT_IN_DRIVERS: readonly AnyProviderDriver[] = [
  GrokAgentDriver,
  CursorAgentDriver,
  PiDriver,
  OmpDriver,
  ClaudeDriver,
  CodexDriver,
  AntigravityDriver,
  OpenAICompatDriver,
];
