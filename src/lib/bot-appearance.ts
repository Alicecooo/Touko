import { portraitExpressionForState, type PortraitExpression } from "../../shared/portrait-avatars";
import type { MausColor } from "../../shared/wire";
export { MAUS_COLOR_NAMES, type MausColor } from "../../shared/wire";

export const BOT_COLORS = {
  green: "#009957",
  blue: "#377FE6",
  red: "#D94B52",
  orange: "#E78531",
  purple: "#8057C8",
  cyan: "#0EA5C6",
  pink: "#D84F8B",
  yellow: "#D8A729",
  teal: "#01A492",
  coral: "#E5634E",
} satisfies Record<MausColor, string>;


// Historical profile expressions are mapped to the current six pictures when read.
const KNOWN_STATES = new Set<string>(["sleeping","waking","idle","listening","thinking","searching","working","excited","surprised","suspicious","angry","drowsy","happy","curious","confused","bored","proud","shy","sad","laughing","scared","playful","celebrate","orbit","radar","progress","spawning","humming","loading","dictating","sending","receiving","uploading","writing","notifying","alerting","bouncing","dragging","powering-down","deadpan","friendly","focused","sleepy","skeptical","worried","mischievous"]);
export function normalizeState(value: string | null | undefined): PortraitExpression | null {
  return value && KNOWN_STATES.has(value) ? portraitExpressionForState(value) : null;
}

