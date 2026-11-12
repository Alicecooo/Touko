
export interface FeatureFlagConfig {
  features?: { skillAuthoring?: boolean; showToolCalls?: boolean; sharedComputers?: boolean; claudeUserMcp?: boolean; claudeUserSkills?: boolean; routinesInConversation?: boolean; llmThreadTitles?: boolean; skillsLibrary?: boolean; shareLearnedSkills?: "off" | "ask" | "auto" };

}
export function skillAuthoringEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.skillAuthoring !== false;
}

export function showToolCallsEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.showToolCalls === true;
}

export function routinesInConversationEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.routinesInConversation === true;
}

export function sharedComputersEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.sharedComputers === true;
}

export function claudeUserMcpEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.claudeUserMcp === true;
}

export function claudeUserSkillsEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.claudeUserSkills === true;
}

export function llmThreadTitlesEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.llmThreadTitles === true;
}

export function skillsLibraryEnabled(config: FeatureFlagConfig | null | undefined): boolean {
  return config?.features?.skillsLibrary === true;
}

export function shareLearnedSkillsMode(config: FeatureFlagConfig | null | undefined): "off" | "ask" | "auto" {
  if (!skillsLibraryEnabled(config)) return "off";
  return config?.features?.shareLearnedSkills ?? "ask";
}

