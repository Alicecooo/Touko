import type { InstanceInfo } from "@/state/store";

export interface CliProbe {
  ok: boolean;
  error?: boolean;
  version?: string;
  message?: string;
}

const CORE_CLI_IDS = ["omp", "pi", "claude", "codex", "antigravity", "cursor", "grok"];

export function agentCliInstances(instances: readonly InstanceInfo[]): InstanceInfo[] {
  const roots = instances.filter((instance) => !instance.readOnly
    && Boolean(instance.cliDefault || instance.cli));
  const selected: InstanceInfo[] = [];
  for (const id of CORE_CLI_IDS) {
    const instance = roots.find((candidate) => candidate.instanceId === id);
    if (instance) selected.push(instance);
  }
  return selected;
}

export function agentCliName(instance: Pick<InstanceInfo, "driverKind" | "displayName">): string {
  if (instance.driverKind === "claudeAgent") return "Claude Code";
  if (instance.driverKind === "codex") return "Codex CLI";
  if (instance.driverKind === "piAgent") return "Pi";
  if (instance.driverKind === "ompAgent") return "Oh My Pi";
  return instance.displayName;
}
