// Build the bundled model catalog snapshot from models.dev.
//
//   node scripts/generators/generate-model-catalog.mjs --input api.json --commit <sha> --updated-at <ISO time>
//   node scripts/generators/generate-model-catalog.mjs --commit <sha> --updated-at <ISO time>   (fetches models.dev/api.json)
//
// models.dev (https://github.com/anomalyco/models.dev) is MIT licensed,
// Copyright (c) 2025 models.dev. Its full licence text travels inside the
// snapshot (source.licenseText) and is kept at third_party/models-dev/LICENSE.
//
// Only current, tool-calling, text-input models are kept, and any provider or
// model with `{` or `}` in its strings is dropped: OpenCode expands {env:…} and
// {file:…} anywhere in its config.
//
// Output is one model per line so a refresh reads as a per-model diff.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { MODEL_CATALOG_SCHEMA, catalogStats, packCatalog, trimModelsDevCatalog, unpackCatalog } from "../../server/model-catalog/trim.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SNAPSHOT_PATH = join(root, "server", "model-catalog", "models-dev.snapshot.json");
export const LICENSE_PATH = join(root, "third_party", "models-dev", "LICENSE");
export const MODELS_DEV_API = "https://models.dev/api.json";
export const MODELS_DEV_REPOSITORY = "https://github.com/anomalyco/models.dev";
/** The snapshot ships inside every app build; keep it small. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export function buildCatalogDocument(raw, { commit, updatedAt, licenseText, onDrop } = {}) {
  if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error("--commit must be the models.dev commit the data came from");
  const time = new Date(updatedAt ?? "");
  if (!updatedAt || Number.isNaN(time.getTime())) throw new Error("--updated-at must be an ISO time (the commit time)");
  const providers = trimModelsDevCatalog(raw, { onDrop });
  if (!Object.keys(providers).length) throw new Error("the input held no usable providers");
  return {
    schema: MODEL_CATALOG_SCHEMA,
    updatedAt: time.toISOString(),
    source: {
      name: "models.dev",
      url: MODELS_DEV_API,
      repository: MODELS_DEV_REPOSITORY,
      commit,
      license: "MIT",
      licenseText,
    },
    providers: packCatalog(providers),
  };
}

/** Stable text form: the header on one line, then one model per line. */
export function serializeCatalog(doc) {
  const { providers, ...head } = doc;
  const ids = Object.keys(providers);
  let out = `${JSON.stringify(head).slice(0, -1)},"providers":{\n`;
  ids.forEach((id, index) => {
    const { models, ...fields } = providers[id];
    const modelIds = Object.keys(models);
    out += `${JSON.stringify(id)}:${JSON.stringify(fields).slice(0, -1)},"models":{`;
    if (modelIds.length) out += `\n${modelIds.map((model) => `${JSON.stringify(model)}:${JSON.stringify(models[model])}`).join(",\n")}\n`;
    out += `}}${index < ids.length - 1 ? "," : ""}\n`;
  });
  return `${out}}}\n`;
}

/** .gitattributes pins the snapshot and licence files to LF, so a working tree
 * still holding CRLF fails on content, not on line endings. */
export const toLf = (text) => text.replace(/\r\n/g, "\n");

async function download(url) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_INPUT_BYTES) throw new Error(`${url} is larger than ${MAX_INPUT_BYTES} bytes`);
  return text;
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      commit: { type: "string" },
      "updated-at": { type: "string" },
      out: { type: "string" },
    },
  });
  const out = values.out ?? SNAPSHOT_PATH;


  const text = values.input ? readFileSync(values.input, "utf8") : await download(MODELS_DEV_API);
  const drops = [];
  const doc = buildCatalogDocument(JSON.parse(text), {
    commit: values.commit,
    updatedAt: values["updated-at"],
    licenseText: toLf(readFileSync(LICENSE_PATH, "utf8")),
    onDrop: (drop) => drops.push(drop),
  });
  const serialized = serializeCatalog(doc);
  writeFileSync(out, serialized);

  const stats = catalogStats(trimModelsDevCatalog(unpackCatalog(doc.providers)));
  const braceProviders = drops.filter((drop) => drop.reason === "brace" && !drop.model).map((drop) => drop.provider);
  const braceModels = drops.filter((drop) => drop.reason === "brace" && drop.model).length;
  const invalid = drops.filter((drop) => drop.reason === "invalid").map((drop) => drop.model ? `${drop.provider}/${drop.model}` : drop.provider);
  console.log(`model catalog: ${stats.providers} providers, ${stats.models} models`);
  console.log(`  dropped for { or }: providers ${braceProviders.join(", ") || "none"}; ${braceModels} models`);
  if (invalid.length) console.log(`  dropped as malformed: ${invalid.join(", ")}`);
  console.log(`  ${serialized.length} bytes, ${gzipSync(serialized).length} gzipped → ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`model catalog: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
