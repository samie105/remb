import type { IDEParser, IDEProject, ParsedConversation } from "./types.js";
import {
  JETBRAINS_CONFIGS,
  detectJetBrains,
  listJetBrainsProjects,
  parseJetBrainsConversations,
} from "./jetbrains-base.js";

const config = JETBRAINS_CONFIGS.pycharm;

export class PyCharmParser implements IDEParser {
  readonly id = "pycharm" as const;
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
