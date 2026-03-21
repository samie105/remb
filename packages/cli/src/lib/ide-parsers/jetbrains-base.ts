import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { IDEProject, ParsedConversation, IDESource } from "./types.js";

/**
 * Shared base for JetBrains IDEs that store AI chat history in XML files.
 * Used by: IntelliJ IDEA, PyCharm, Android Studio
 *
 * All JetBrains IDEs use similar XML structures with ChatSessionState
 * or AI Assistant components. Data location varies by product.
 */

interface JetBrainsConfig {
  id: IDESource;
  displayName: string;
  /** Application Support folder names to search (version-specific) */
  folderPatterns: string[];
  /** Sub-path within the version folder where XML files live */
  subPath: string;
  /** XML tag names to search for conversation data */
  xmlTags: string[];
}

export const JETBRAINS_CONFIGS: Record<string, JetBrainsConfig> = {
  intellij: {
    id: "intellij",
    displayName: "IntelliJ IDEA",
    folderPatterns: ["IntelliJIdea"],
    subPath: "workspace",
    xmlTags: ["ChatSessionState", "AiAssistant"],
  },
  pycharm: {
    id: "pycharm",
    displayName: "PyCharm",
    folderPatterns: ["PyCharm"],
    subPath: "options",
    xmlTags: ["ChatSessionState", "AiAssistant"],
  },
  "android-studio": {
    id: "android-studio",
    displayName: "Android Studio",
    folderPatterns: ["AndroidStudio"],
    subPath: "workspace",
    xmlTags: ["GeminiChat", "StudioBot", "ChatSessionState"],
  },
};

/** Get the JetBrains config directory root (platform-aware) */
function getJetBrainsRoot(vendorDir: string): string {
  const home = homedir();
  const os = platform();

  if (os === "darwin") {
    return join(home, "Library", "Application Support", vendorDir);
  }
  if (os === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), vendorDir);
  }
  // Linux
  return join(home, `.config/${vendorDir}`);
}

/**
 * Find all installed version directories for a JetBrains product.
 * E.g., ~/Library/Application Support/JetBrains/IntelliJIdea2024.2/
 */
export function findVersionDirs(config: JetBrainsConfig): string[] {
  const vendor = config.id === "android-studio" ? "Google" : "JetBrains";
  const root = getJetBrainsRoot(vendor);
  if (!existsSync(root)) return [];

  try {
    return readdirSync(root)
      .filter((name) => config.folderPatterns.some((p) => name.startsWith(p)))
      .map((name) => join(root, name))
      .filter((p) => existsSync(p) && statSync(p).isDirectory());
  } catch {
    return [];
  }
}

/** Detect whether any matching version directories exist */
export function detectJetBrains(config: JetBrainsConfig): boolean {
  return findVersionDirs(config).length > 0;
}

/** List projects from JetBrains version directories */
export function listJetBrainsProjects(config: JetBrainsConfig): IDEProject[] {
  const projects: IDEProject[] = [];
  const versionDirs = findVersionDirs(config);

  for (const versionDir of versionDirs) {
    const xmlDir = join(versionDir, config.subPath);
    if (!existsSync(xmlDir)) {
      // For PyCharm, also check the options directory for ai_assistant.xml
      if (config.id === "pycharm") {
        const optDir = join(versionDir, "options");
        const aiFile = join(optDir, "ai_assistant.xml");
        if (existsSync(aiFile)) {
          const stat = statSync(aiFile);
          projects.push({
            id: `${versionDir.split("/").pop()}-ai_assistant`,
            name: `${config.displayName} (${versionDir.split("/").pop()})`,
            storagePath: optDir,
            lastModified: stat.mtime,
          });
        }
      }
      continue;
    }

    try {
      const xmlFiles = readdirSync(xmlDir).filter((f) => f.endsWith(".xml"));
      if (xmlFiles.length === 0) continue;

      const stat = statSync(xmlDir);
      projects.push({
        id: versionDir.split("/").pop() ?? versionDir,
        name: `${config.displayName} (${versionDir.split("/").pop()})`,
        storagePath: xmlDir,
        lastModified: stat.mtime,
      });
    } catch { /* skip inaccessible */ }
  }

  return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/** Parse conversations from JetBrains XML files */
export function parseJetBrainsConversations(
  config: JetBrainsConfig,
  projectId: string,
): ParsedConversation[] {
  const projects = listJetBrainsProjects(config);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return [];

  const conversations: ParsedConversation[] = [];

  try {
    const files = readdirSync(project.storagePath).filter((f) => f.endsWith(".xml"));

    for (const file of files) {
      const filePath = join(project.storagePath, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const parsed = extractConversationsFromXml(content, config.xmlTags);
        conversations.push(...parsed);
      } catch { /* skip corrupted files */ }
    }
  } catch { /* skip inaccessible directory */ }

  return conversations;
}

/**
 * Extract conversations from JetBrains XML using simple regex parsing.
 * We avoid a full XML parser dependency — the format is predictable enough.
 */
function extractConversationsFromXml(xml: string, tagNames: string[]): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];

  for (const tag of tagNames) {
    // Find all occurrences of the tag and its content
    const tagRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(xml)) !== null) {
      const inner = match[1];
      const messages = extractMessagesFromXmlBlock(inner);
      if (messages.length === 0) continue;

      // Try to extract a session ID from the XML attributes
      const idMatch = match[0].match(/(?:id|sessionId|name)="([^"]+)"/);
      const id = idMatch ? idMatch[1] : crypto.randomUUID();

      conversations.push({
        id,
        messages,
        title: messages.find((m) => m.role === "user")?.text.slice(0, 100),
      });
    }
  }

  // Also look for content between <content> tags (common in ai_assistant.xml)
  if (conversations.length === 0) {
    const contentBlocks = xml.match(/<content>([\s\S]*?)<\/content>/gi);
    if (contentBlocks) {
      for (const block of contentBlocks) {
        const text = block.replace(/<\/?content>/gi, "").trim();
        if (!text) continue;

        // Try to split into user/assistant by looking for common patterns
        const messages = splitConversationText(text);
        if (messages.length > 0) {
          conversations.push({
            id: crypto.randomUUID(),
            messages,
          });
        }
      }
    }
  }

  return conversations;
}

function extractMessagesFromXmlBlock(xml: string): Array<{ role: "user" | "assistant"; text: string }> {
  const messages: Array<{ role: "user" | "assistant"; text: string }> = [];

  // Look for message elements with role attributes
  const msgRegex = /<(?:message|entry|item)[^>]*role="(user|assistant|ai|human|bot)"[^>]*>([\s\S]*?)<\/(?:message|entry|item)>/gi;
  let match: RegExpExecArray | null;

  while ((match = msgRegex.exec(xml)) !== null) {
    const role = match[1].toLowerCase();
    const text = decodeXmlEntities(match[2].replace(/<[^>]+>/g, "").trim());
    if (!text) continue;

    messages.push({
      role: role === "user" || role === "human" ? "user" : "assistant",
      text,
    });
  }

  // If no structured messages, try CDATA blocks
  if (messages.length === 0) {
    const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
    while ((match = cdataRegex.exec(xml)) !== null) {
      const text = match[1].trim();
      if (text.length > 5) {
        messages.push({ role: messages.length % 2 === 0 ? "user" : "assistant", text });
      }
    }
  }

  return messages;
}

function splitConversationText(text: string): Array<{ role: "user" | "assistant"; text: string }> {
  const messages: Array<{ role: "user" | "assistant"; text: string }> = [];
  // Simple heuristic: alternate between user and assistant per paragraph
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  for (let i = 0; i < paragraphs.length; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      text: paragraphs[i].trim(),
    });
  }

  return messages;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
