export interface BotRole {
  id: string;
  name: string;
  title: string;
  description: string;
  apps: string[];
}

export const BOT_ROLES: BotRole[] = [
  {
    id: "assistant",
    name: "Assistant",
    title: "General assistant",
    description: "Answers questions, drafts text, and takes on whatever you hand it.",
    apps: [],
  },
  {
    id: "inbox",
    name: "Inbox",
    title: "Email triage",
    description: "Reads your inbox, flags what needs you, and drafts replies for approval.",
    apps: ["gmail"],
  },
  {
    id: "research",
    name: "Scout",
    title: "Researcher",
    description: "Digs through the web and your files, and comes back with a sourced brief.",
    apps: [],
  },
  {
    id: "coder",
    name: "Dev",
    title: "Coding partner",
    description: "Works inside a project folder: reads, edits, runs tests, explains changes.",
    apps: ["github"],
  },
  {
    id: "community",
    name: "Watch",
    title: "Community monitor",
    description: "Watches Discord, Slack, or forums and reports what matters, on a schedule.",
    apps: ["discord", "slack"],
  },
  {
    id: "ops",
    name: "Ops",
    title: "Operations",
    description: "Keeps calendars, tasks, and follow-ups moving; nudges you before things slip.",
    apps: ["googlecalendar", "notion", "linear"],
  },
];

export function botRole(id: string): BotRole | undefined {
  return BOT_ROLES.find((role) => role.id === id);
}

export function roleProfilePatch(role: BotRole): {
  name: string;
  title: string;
  description: string;
} {
  return {
    name: role.name,
    title: role.title,
    description: role.description,
  };
}
