import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { MODEL_CATALOG_SCHEMA, containsBrace, packCatalog, trimModelsDevCatalog, unpackCatalog } from "../../server/model-catalog/trim.ts";
import { SNAPSHOT_PATH, serializeCatalog, toLf } from "../../scripts/generators/generate-model-catalog.mjs";
export const MAX_GZIP_BYTES = 150 * 1024;

export function snapshotProblems(input) {
  const problems = [];
  const text = toLf(input);
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return ["the snapshot is not valid JSON"];
  }
  if (doc?.schema !== MODEL_CATALOG_SCHEMA) problems.push(`schema must be ${MODEL_CATALOG_SCHEMA}`);
  if (Number.isNaN(new Date(doc?.updatedAt ?? "").getTime())) problems.push("updatedAt must be an ISO time");
  if (!doc?.source?.commit) problems.push("source.commit is missing");
  if (!doc?.source?.licenseText?.includes("Permission is hereby granted")) problems.push("source.licenseText must hold the full MIT permission notice");
  if (containsBrace(doc?.providers)) problems.push("a provider or model contains { or }");
  if (JSON.stringify(packCatalog(trimModelsDevCatalog(unpackCatalog(doc?.providers)))) !== JSON.stringify(doc?.providers)) problems.push("providers are not in trimmed form; rebuild the snapshot");
  if (serializeCatalog(doc) !== text) problems.push("formatting differs from the build script's output; rebuild the snapshot");
  const gzip = gzipSync(text).length;
  if (gzip > MAX_GZIP_BYTES) problems.push(`gzipped size ${gzip} bytes exceeds ${MAX_GZIP_BYTES}`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = snapshotProblems(readFileSync(SNAPSHOT_PATH, "utf8"));
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log("model catalog: snapshot is sound");
}
