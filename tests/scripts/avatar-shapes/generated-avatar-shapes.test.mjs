import { describe, expect, it } from "vitest";

import { BODY_DEFS } from "../../../scripts/generators/avatar-shapes/shape-definitions.ts";
import { maskFromPolylines } from "../../../scripts/generators/avatar-shapes/shape-rasterizer.ts";
import { applyFit, boundsOf, fitTransform, flatten } from "../../../scripts/generators/avatar-shapes/path-geometry.ts";
import { fieldFromMask } from "../../../scripts/generators/avatar-shapes/distance-field.ts";
import { buildClouds, report } from "../../../scripts/generators/avatar-shapes/face-placement.ts";
import { MASCOT_BODIES, MASCOT_BODY_IDS } from "../../../shared/mascot-bodies.ts";

describe("every baked anchor", () => {
  /** The four extreme pointer aims the generator solves against. */
  const AIMS = [
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
  ];

  it("clears the silhouette across every expression and every gaze", () => {
    for (const id of MASCOT_BODY_IDS) {
      const def = BODY_DEFS.find(s => s.id === id);
      const polylines = flatten(def.d);
      const fit = fitTransform(boundsOf(polylines));
      const sdf = fieldFromMask(maskFromPolylines(applyFit(polylines, fit), 256), 256);

      for (const aim of AIMS) {
        const result = report(buildClouds(0, undefined, aim), sdf, MASCOT_BODIES[id].anchor);
        expect(result.clipping, `${id} clips looking (${aim.x}, ${aim.y})`).toEqual([]);
      }
    }
  }, 120_000);
});
