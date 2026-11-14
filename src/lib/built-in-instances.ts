/** The server's default instances by id and their driver kinds. */
export const BUILT_IN_INSTANCE_DRIVERS: Readonly<Record<string, string>> = {
  pi: "piAgent",
  omp: "ompAgent",
  claude: "claudeAgent",
  codex: "codex",
  antigravity: "antigravityAgent",
  cursor: "cursorAgent",
  grok: "grokAgent",
};
