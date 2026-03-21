package parsers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

// ── Claude Code Parser ──────────────────────────────────

// ClaudeCodeParser parses chat history from Claude Code CLI (~/.claude/projects/).
type ClaudeCodeParser struct{}

func (p *ClaudeCodeParser) ID() IDESource       { return IDEClaudeCode }
func (p *ClaudeCodeParser) DisplayName() string { return "Claude Code" }

func (p *ClaudeCodeParser) Detect() (bool, error) {
	home, _ := os.UserHomeDir()
	return dirExists(filepath.Join(home, ".claude", "projects")), nil
}

func (p *ClaudeCodeParser) ListProjects() ([]IDEProject, error) {
	home, _ := os.UserHomeDir()
	projectsDir := filepath.Join(home, ".claude", "projects")

	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return nil, err
	}

	var projects []IDEProject
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// Folder names are URL-encoded workspace paths
		decoded, err := url.PathUnescape(entry.Name())
		if err != nil {
			decoded = entry.Name()
		}

		name := filepath.Base(decoded)
		info, _ := entry.Info()
		lastMod := time.Time{}
		if info != nil {
			lastMod = info.ModTime()
		}

		// Check for .jsonl files
		projDir := filepath.Join(projectsDir, entry.Name())
		jsonlFiles, _ := filepath.Glob(filepath.Join(projDir, "*.jsonl"))
		if len(jsonlFiles) == 0 {
			continue
		}

		projects = append(projects, IDEProject{
			ID:            entry.Name(),
			Name:          name,
			StoragePath:   projDir,
			WorkspacePath: decoded,
			LastModified:  lastMod,
		})
	}

	sort.Slice(projects, func(i, j int) bool {
		return projects[i].LastModified.After(projects[j].LastModified)
	})
	return projects, nil
}

func (p *ClaudeCodeParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	home, _ := os.UserHomeDir()
	projDir := filepath.Join(home, ".claude", "projects", projectID)

	files, err := filepath.Glob(filepath.Join(projDir, "*.jsonl"))
	if err != nil {
		return nil, err
	}

	var convs []ParsedConversation
	for _, f := range files {
		conv, err := parseClaudeJSONL(f)
		if err != nil || len(conv.Messages) == 0 {
			continue
		}
		convs = append(convs, conv)
	}
	return convs, nil
}

func parseClaudeJSONL(path string) (ParsedConversation, error) {
	f, err := os.Open(path)
	if err != nil {
		return ParsedConversation{}, err
	}
	defer f.Close()

	id := filepath.Base(path)
	id = strings.TrimSuffix(id, filepath.Ext(id))

	conv := ParsedConversation{ID: id}
	var msgs []ConversationMessage

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024) // 10MB max line
	for scanner.Scan() {
		var record map[string]interface{}
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			continue
		}

		role := "assistant"
		if r, ok := record["role"].(string); ok {
			role = normalizeRole(r)
		}
		if r, ok := record["type"].(string); ok {
			if r == "human" || r == "user" {
				role = "user"
			}
		}

		text := extractText(record)
		if text == "" {
			continue
		}

		var ts int64
		if v, ok := record["timestamp"].(float64); ok {
			ts = int64(v)
		}

		msgs = append(msgs, ConversationMessage{
			Role:      role,
			Text:      text,
			Timestamp: ts,
		})
	}

	conv.Messages = msgs
	if len(msgs) > 0 && msgs[0].Timestamp > 0 {
		t := time.UnixMilli(msgs[0].Timestamp)
		conv.StartedAt = &t
	}
	return conv, nil
}

// ── Zed Parser ──────────────────────────────────────

// ZedParser parses chat history from Zed editor.
type ZedParser struct{}

func (p *ZedParser) ID() IDESource       { return IDEZed }
func (p *ZedParser) DisplayName() string { return "Zed" }

func (p *ZedParser) Detect() (bool, error) {
	return dirExists(zedConversationsDir()), nil
}

func (p *ZedParser) ListProjects() ([]IDEProject, error) {
	dir := zedConversationsDir()
	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, nil
	}

	latest := time.Time{}
	for _, f := range files {
		if info, err := os.Stat(f); err == nil && info.ModTime().After(latest) {
			latest = info.ModTime()
		}
	}

	return []IDEProject{{
		ID:           "zed-conversations",
		Name:         "Zed Conversations",
		StoragePath:  dir,
		LastModified: latest,
	}}, nil
}

func (p *ZedParser) ParseConversations(_ string) ([]ParsedConversation, error) {
	dir := zedConversationsDir()
	return parseJSONFileConversations(dir)
}

func zedConversationsDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "Zed", "conversations")
	case "linux":
		return filepath.Join(home, ".local", "share", "zed", "conversations")
	default:
		return filepath.Join(home, ".local", "share", "zed", "conversations")
	}
}

// ── Sublime Text Parser ──────────────────────────────────────

// SublimeTextParser parses chat history from Sublime Text (LSP-Copilot).
type SublimeTextParser struct{}

func (p *SublimeTextParser) ID() IDESource       { return IDESublimeText }
func (p *SublimeTextParser) DisplayName() string { return "Sublime Text" }

func (p *SublimeTextParser) Detect() (bool, error) {
	return dirExists(sublimeHistoryDir()), nil
}

func (p *SublimeTextParser) ListProjects() ([]IDEProject, error) {
	dir := sublimeHistoryDir()
	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, nil
	}

	latest := time.Time{}
	for _, f := range files {
		if info, err := os.Stat(f); err == nil && info.ModTime().After(latest) {
			latest = info.ModTime()
		}
	}

	return []IDEProject{{
		ID:           "sublime-history",
		Name:         "Sublime Text History",
		StoragePath:  dir,
		LastModified: latest,
	}}, nil
}

func (p *SublimeTextParser) ParseConversations(_ string) ([]ParsedConversation, error) {
	return parseJSONFileConversations(sublimeHistoryDir())
}

func sublimeHistoryDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "Sublime Text", "Packages", "User", "LSP-copilot-history")
	case "linux":
		return filepath.Join(home, ".config", "sublime-text", "Packages", "User", "LSP-copilot-history")
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, "Sublime Text", "Packages", "User", "LSP-copilot-history")
	default:
		return ""
	}
}

// ── Helpers ──────────────────────────────────────

func dirExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func visualStudioBaseDir() string {
	if runtime.GOOS != "windows" {
		return ""
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		home, _ := os.UserHomeDir()
		localAppData = filepath.Join(home, "AppData", "Local")
	}
	return filepath.Join(localAppData, "Microsoft", "VisualStudio")
}

// listSubdirProjects lists subdirectories that contain a given child folder name.
func listSubdirProjects(baseDir, childName string) ([]IDEProject, error) {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil, err
	}

	var projects []IDEProject
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		childDir := filepath.Join(baseDir, entry.Name(), childName)
		if !dirExists(childDir) {
			continue
		}
		info, _ := entry.Info()
		lastMod := time.Time{}
		if info != nil {
			lastMod = info.ModTime()
		}
		projects = append(projects, IDEProject{
			ID:           entry.Name(),
			Name:         fmt.Sprintf("Visual Studio %s", entry.Name()),
			StoragePath:  childDir,
			LastModified: lastMod,
		})
	}
	return projects, nil
}

// parseJSONFileConversations reads all JSON files in a directory and extracts conversations.
func parseJSONFileConversations(dir string) ([]ParsedConversation, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}

	var convs []ParsedConversation
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}

		id := filepath.Base(f)
		id = strings.TrimSuffix(id, ".json")

		// Try as a single conversation object
		var obj map[string]json.RawMessage
		if json.Unmarshal(data, &obj) == nil {
			var msgs []ConversationMessage

			// Try known message container fields
			for _, field := range []string{"messages", "turns", "history", "exchanges"} {
				if raw, ok := obj[field]; ok {
					msgs = parseChatMessages(raw)
					if len(msgs) > 0 {
						break
					}
				}
			}

			if len(msgs) > 0 {
				conv := ParsedConversation{ID: id, Messages: msgs}
				if raw, ok := obj["title"]; ok {
					var title string
					if json.Unmarshal(raw, &title) == nil {
						conv.Title = title
					}
				}
				// Extract timestamp from file info
				if info, err := os.Stat(f); err == nil {
					t := info.ModTime()
					conv.StartedAt = &t
				}
				convs = append(convs, conv)
				continue
			}
		}

		// Try as array of conversations
		result := extractConversationsFromJSON(string(data))
		for i := range result {
			if result[i].ID == "" || result[i].ID == fmt.Sprintf("conv-%d", i) {
				result[i].ID = id
			}
		}
		convs = append(convs, result...)
	}

	return convs, nil
}

// extractText extracts text content from a JSON record (Claude Code format).
func extractText(record map[string]interface{}) string {
	// Direct text/content field
	for _, field := range []string{"text", "content", "message"} {
		if v, ok := record[field]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
			// Content blocks array
			if blocks, ok := v.([]interface{}); ok {
				var parts []string
				for _, block := range blocks {
					if m, ok := block.(map[string]interface{}); ok {
						if t, ok := m["text"].(string); ok {
							parts = append(parts, t)
						}
					}
				}
				if len(parts) > 0 {
					return strings.Join(parts, " ")
				}
			}
		}
	}
	return ""
}
