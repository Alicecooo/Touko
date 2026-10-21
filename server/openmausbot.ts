import { main } from "./cli/cli.ts";
import { exitAfterFlush } from "./platform/exit.ts";

main().then(exitAfterFlush, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  exitAfterFlush(1);
});
