import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";
import {
  JETBRAINS_CONFIGS,
  detectJetBrains,
  listJetBrainsProjects,
  parseJetBrainsConversations,
} from "./jetbrains-base.js";

const config = JETBRAINS_CONFIGS["android-studio"];

export class AndroidStudioParser implements IDEParser {
  readonly id = "android-studio" as const;
  readonly displayName = config.displayName;

  async detect(): Promise<boolean> {
    return detectJetBrains(config);
  }

  async listProjects(): Promise<IDEProject[]> {
    return listJetBrainsProjects(config);
  }

  async parseConversations(projectId: string): Promise<ParsedConversation[]> {
    return parseJetBrainsConversations(config, projectId);
  }
}
