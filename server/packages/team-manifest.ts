import { z } from "zod";

import { schemaIssue, type JsonValue } from "../config/schema.ts";
import type { MausColor } from "../storage/store.ts";
import { takeImportName } from "../../shared/import-name.ts";
import { optionalText, requiredText } from "../../shared/package-format.ts";

export const TEAM_MANIFEST_FORMAT = "openmaus.team" as const;
export const TEAM_MANIFEST_VERSION = 2 as const;
export const LEGACY_TEAM_MANIFEST_VERSION = 1 as const;
export const MAX_TEAM_MEMBERS = 200;

const COLORS = [
  "green",
  "blue",
  "red",
  "orange",
  "purple",
  "cyan",
  "pink",
  "yellow",
  "teal",
  "coral",
] as const satisfies readonly MausColor[];

const memberSchema = z.object({
  key: requiredText(64).regex(/^[a-z0-9][a-z0-9_-]*$/, {
    message: "may only contain lowercase letters, numbers, - and _",
  }),
  name: requiredText(100),
  title: optionalText(200),
  description: optionalText(4_000),
  appearance: z.object({
    color: z.enum(COLORS, { error: "is not supported" }),
    mascotExpression: optionalText(80),
    mascotBody: optionalText(40),
  }),
});

const membersSchema = z
  .array(memberSchema)
  .min(1, { message: "A team needs at least one member" })
  .max(MAX_TEAM_MEMBERS, { message: `A team can have at most ${MAX_TEAM_MEMBERS} members` });

const manifestSchema = z.discriminatedUnion("version", [
  z.object({
    format: z.literal(TEAM_MANIFEST_FORMAT, { error: "This is not an OpenMaus team file" }),
    version: z.literal(LEGACY_TEAM_MANIFEST_VERSION),
    team: z.object({
      name: requiredText(100),
      description: optionalText(2_000),
      members: membersSchema,
      // Version 1 required room configuration. Consume it as opaque legacy data and ignore it.
      room: z.record(z.string(), z.unknown()),
    }),
  }),
  z.object({
    format: z.literal(TEAM_MANIFEST_FORMAT, { error: "This is not an OpenMaus team file" }),
    version: z.literal(TEAM_MANIFEST_VERSION),
    team: z.object({
      name: requiredText(100),
      description: optionalText(2_000),
      members: membersSchema,
    }),
  }),
]);

export interface TeamManifestMember {
  key: string;
  name: string;
  title: string;
  description: string;
  appearance: {
    color: MausColor;
    mascotExpression?: string;
    mascotBody?: string;
  };
}

export interface ParsedTeamManifest {
  format: typeof TEAM_MANIFEST_FORMAT;
  version: typeof LEGACY_TEAM_MANIFEST_VERSION | typeof TEAM_MANIFEST_VERSION;
  team: {
    name: string;
    description?: string;
    members: TeamManifestMember[];
  };
}

export interface TeamManifestV2 {
  format: typeof TEAM_MANIFEST_FORMAT;
  version: typeof TEAM_MANIFEST_VERSION;
  team: {
    name: string;
    description?: string;
    members: TeamManifestMember[];
  };
}

export type TeamManifestInput = JsonValue | ParsedTeamManifest | TeamManifestV2;

interface ExportableBot {
  id: string;
  name: string;
  title: string;
  description: string;
  color: MausColor;
  mascotExpression?: string | null;
  mascotBody?: string | null;
}

interface ExportableTeam {
  name: string;
  memberIds: string[];
}

export function parseTeamManifest(value: TeamManifestV2): TeamManifestV2;
export function parseTeamManifest(value: TeamManifestInput): ParsedTeamManifest;
export function parseTeamManifest(value: TeamManifestInput): ParsedTeamManifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    const formatIssue = parsed.error.issues.find((issue) => issue.path[0] === "format");
    if (formatIssue) throw new Error(formatIssue.message);
    const versionIssue = parsed.error.issues.find((issue) => issue.path[0] === "version");
    if (versionIssue) throw new Error("Team file version is not supported");
    throw new Error(schemaIssue(parsed.error, "This is not a team file"));
  }

  const seenKeys = new Set<string>();
  const members = parsed.data.team.members.map((member): TeamManifestMember => {
    if (seenKeys.has(member.key)) throw new Error(`Duplicate member key: ${member.key}`);
    seenKeys.add(member.key);
    const appearance: TeamManifestMember["appearance"] = { color: member.appearance.color };
    if (member.appearance.mascotExpression) appearance.mascotExpression = member.appearance.mascotExpression;
    return {
      key: member.key,
      name: member.name,
      title: member.title ?? "",
      description: member.description ?? "",
      appearance,
    };
  });

  const result: ParsedTeamManifest = {
    format: TEAM_MANIFEST_FORMAT,
    version: parsed.data.version,
    team: {
      name: parsed.data.team.name,
      members,
    },
  };
  if (parsed.data.team.description) result.team.description = parsed.data.team.description;

  return result;
}

export interface ImportedMemberProfile {
  name: string;
  title: string;
  description: string;
  color: MausColor;
  mascotExpression?: string;
}

/** Everything an untrusted manifest may seed into a new bot, and nothing else:
 * - an allowlist built field by field, so privilege-bearing fields are structurally absent; the caller must still
 *   force composio: false and connectorTools: {} (absence means allowed);
 * - no name captures: names are identity for @mentions, rosters and approvals, so a collision is numbered
 *   ("Scout 2"), case-insensitively; `takenNames` (lowercased) is mutated as names are claimed. */
export function importedMemberProfile(
  member: TeamManifestMember,
  takenNames: Set<string>,
): ImportedMemberProfile {
  const name = takeImportName(member.name, takenNames);
  const profile: ImportedMemberProfile = {
    name,
    title: member.title,
    description: member.description,
    color: member.appearance.color,
  };
  if (member.appearance.mascotExpression) profile.mascotExpression = member.appearance.mascotExpression;
  return profile;
}

function memberKey(name: string, index: number, used: Set<string>): string {
  const stem =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `member-${index + 1}`;
  let key = stem;
  let suffix = 2;
  while (used.has(key)) key = `${stem}-${suffix++}`;
  used.add(key);
  return key;
}

/** Build a shareable definition only: no IDs, transcripts, engines or permissions. */
export function createTeamManifest(team: ExportableTeam, bots: ExportableBot[]): TeamManifestV2 {
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const usedKeys = new Set<string>();
  const members = team.memberIds.map((id, index): TeamManifestMember => {
    const bot = byId.get(id);
    if (!bot) throw new Error(`Team member ${id} no longer exists`);
    const key = memberKey(bot.name, index, usedKeys);
    const appearance: TeamManifestMember["appearance"] = { color: bot.color };
    if (bot.mascotExpression) appearance.mascotExpression = bot.mascotExpression;
    return {
      key,
      name: bot.name,
      title: bot.title,
      description: bot.description,
      appearance,
    };
  });

  const manifest: TeamManifestV2 = {
    format: TEAM_MANIFEST_FORMAT,
    version: TEAM_MANIFEST_VERSION,
    team: {
      name: team.name,
      members,
    },
  };
  // Export and import share the parser, so a file produced here meets the same limits as an untrusted one.
  return parseTeamManifest(manifest);
}
