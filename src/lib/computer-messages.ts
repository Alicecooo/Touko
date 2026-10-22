import { t } from "./i18n";

/**
 * Computer status responses come from the server so they can also be useful
 * in logs and API clients. Translate the known user-facing status messages at
 * the UI boundary, including statuses that only occur in failure branches.
 */
export function localizeComputerProblem(problem: string | null | undefined): string | null {
  if (!problem) return problem ?? null;
  const exact: Record<string, Parameters<typeof t>[0]> = {
    "The existing container was not created by OpenMausBot; recreate it": "computer.problem.unmanaged",
  };
  const key = exact[problem];
  if (key) return t(key);
  return problem;
}
