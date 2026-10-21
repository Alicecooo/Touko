import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLocaleCode, sourceHash } from "../../scripts/generators/generate-translations.mjs";

const LOCALES_DIR = fileURLToPath(new URL("../../src/locales", import.meta.url));
const SOURCE_FILE = "en.json";
const SOURCE_HASH_FILE = "source-hashes.json";
const PLACEHOLDER = /\{(\w+)\}/g;
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function placeholders(value) {
  return [...String(value).matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateSourceCatalog(source) {
  if (!isRecord(source)) return ["English source must be a JSON object"];
  const problems = [];
  for (const [key, value] of Object.entries(source)) {
    if (!key.trim()) problems.push("English source contains an empty key");
    if (typeof value !== "string" || !value.trim()) {
      problems.push(`${key || "(empty key)"}: English value must be a non-empty string`);
    }
  }
  if (Object.keys(source).length === 0) problems.push("English source must contain at least one string");
  return problems;
}

export function validateTranslationCatalog(source, translation, { requireComplete = false } = {}) {
  if (!isRecord(translation)) return ["translation must be a JSON object"];
  const problems = [];
  for (const [key, value] of Object.entries(translation)) {
    if (!Object.hasOwn(source, key)) {
      problems.push(`${key}: key does not exist in English`);
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      problems.push(`${key}: translation must be a non-empty string`);
      continue;
    }
    const expected = placeholders(source[key]);
    const actual = placeholders(value);
    if (!sameStrings(expected, actual)) {
      problems.push(`${key}: placeholders must stay ${JSON.stringify(expected)} (received ${JSON.stringify(actual)})`);
    }
  }
  if (requireComplete) {
    for (const key of Object.keys(source)) {
      if (!Object.hasOwn(translation, key)) problems.push(`${key}: translation is missing`);
    }
  }
  return problems;
}

export function validateTranslationHashes(source, translation, hashes) {
  // The structural validator reports malformed catalogs. Hash validation
  // should add no follow-on TypeError that hides that useful error.
  if (!isRecord(translation)) return [];
  if (!isRecord(hashes)) return ["source-hash record must be a JSON object"];
  const problems = [];
  for (const key of Object.keys(translation)) {
    if (!Object.hasOwn(source, key)) continue;
    const recorded = hashes[key];
    if (typeof recorded !== "string") {
      problems.push(`${key}: translation has not been accepted against its English source`);
    } else if (recorded !== sourceHash(source[key])) {
      problems.push(`${key}: English source changed; refresh the translation or remove it for English fallback`);
    }
  }
  for (const key of Object.keys(hashes)) {
    if (!Object.hasOwn(source, key)) problems.push(`${key}: source-hash key does not exist in English`);
    else if (!Object.hasOwn(translation, key)) problems.push(`${key}: source hash has no matching translation`);
  }
  return problems;
}

function readJson(path, label = basename(path)) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readCatalog(file) {
  return readJson(join(LOCALES_DIR, file), file);
}

function emptySourceHashes() {
  return { version: 1, locales: {} };
}

function readSourceHashes() {
  const path = join(LOCALES_DIR, SOURCE_HASH_FILE);
  if (!existsSync(path)) return emptySourceHashes();
  const value = readJson(path, SOURCE_HASH_FILE);
  if (value?.version !== 1 || !isRecord(value.locales)) {
    throw new Error(`${SOURCE_HASH_FILE}: expected { "version": 1, "locales": { ... } }`);
  }
  for (const [code, hashes] of Object.entries(value.locales)) {
    if (normalizeLocaleCode(code) !== code || code === "en" || !isRecord(hashes)) {
      throw new Error(`${SOURCE_HASH_FILE}: invalid locale entry ${code}`);
    }
  }
  return value;
}

export function checkCatalogs() {
  const source = readCatalog(SOURCE_FILE);
  const sourceProblems = validateSourceCatalog(source);
  if (sourceProblems.length > 0) {
    throw new Error(sourceProblems.map((problem) => `${SOURCE_FILE}: ${problem}`).join("\n"));
  }
  const state = readSourceHashes();
  const errors = [];
  const sourceKeys = Object.keys(source);
  const files = readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(".json") && file !== SOURCE_HASH_FILE)
    .sort();
  const targetCodes = new Set();

  for (const file of files) {
    const stem = file.slice(0, -".json".length);
    try {
      const normalized = normalizeLocaleCode(stem);
      if (normalized !== stem) errors.push(`${file}: locale filenames must be lowercase (${normalized}.json)`);
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (file === SOURCE_FILE) continue;
    targetCodes.add(stem);
    const catalog = readCatalog(file);
    errors.push(...validateTranslationCatalog(source, catalog).map((problem) => `${file}: ${problem}`));
    errors.push(...validateTranslationHashes(source, catalog, state.locales[stem] ?? {}).map(
      (problem) => `${file}: ${problem}`,
    ));
    const translated = isRecord(catalog)
      ? sourceKeys.filter((key) => Object.hasOwn(catalog, key)).length
      : 0;
    const percent = sourceKeys.length === 0 ? 0 : Math.round((translated / sourceKeys.length) * 100);
    console.log(`${file}: ${percent}% (${translated}/${sourceKeys.length})`);
  }

  for (const code of Object.keys(state.locales)) {
    if (!targetCodes.has(code)) errors.push(`${SOURCE_HASH_FILE}: ${code} has no matching locale catalog`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`locale catalogs valid (${files.length} languages, ${sourceKeys.length} English strings)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkCatalogs(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
