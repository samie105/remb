package parsers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// getWorkspaceStoragePath returns the IDE's workspaceStorage directory for a given app name.
func getWorkspaceStoragePath(appName string) string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", appName, "User", "workspaceStorage")
	case "linux":
		return filepath.Join(home, ".config", appName, "User", "workspaceStorage")
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, appName, "User", "workspaceStorage")
	default:
		return ""
	}
}

// detectWorkspaceStorage checks if the workspace storage directory exists.
func detectWorkspaceStorage(appName string) bool {
	path := getWorkspaceStoragePath(appName)
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// listWorkspaceProjects scans workspaceStorage folders for projects.
func listWorkspaceProjects(appName string) ([]IDEProject, error) {
	storagePath := getWorkspaceStoragePath(appName)
	entries, err := os.ReadDir(storagePath)
	if err != nil {
		return nil, err
	}

	var projects []IDEProject
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		projectDir := filepath.Join(storagePath, entry.Name())

		// Read workspace.json for name and folder info
		name := entry.Name()
		workspacePath := ""
		wsFile := filepath.Join(projectDir, "workspace.json")
		if data, err := os.ReadFile(wsFile); err == nil {
			var ws struct {
				Folder string `json:"folder"`
			}
			if json.Unmarshal(data, &ws) == nil && ws.Folder != "" {
				workspacePath = ws.Folder
				// Extract readable name from folder path
				if idx := strings.LastIndex(ws.Folder, "/"); idx >= 0 {
					name = ws.Folder[idx+1:]
				}
			}
		}

		// Check for state.vscdb
		vscdbPath := filepath.Join(projectDir, "state.vscdb")
		info, err := os.Stat(vscdbPath)
		if err != nil {
			continue // no state.vscdb → skip
		}

		projects = append(projects, IDEProject{
			ID:            entry.Name(),
			Name:          name,
			StoragePath:   projectDir,
			WorkspacePath: workspacePath,
			LastModified:  info.ModTime(),
		})
	}

	sort.Slice(projects, func(i, j int) bool {
		return projects[i].LastModified.After(projects[j].LastModified)
	})

	return projects, nil
}

// queryVscdb opens a vscdb file and queries a specific key from the ItemTable.
func queryVscdb(dbPath, key string) (string, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return "", err
	}
	defer db.Close()

	var value string
	err = db.QueryRow("SELECT value FROM ItemTable WHERE key = ?", key).Scan(&value)
	if err != nil {
		return "", err
	}
	return value, nil
}

// queryVscdbLike queries the vscdb with a LIKE pattern.
func queryVscdbLike(dbPath, pattern string) ([]string, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT value FROM ItemTable WHERE key LIKE ?", pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err == nil {
			results = append(results, value)
		}
	}
	return results, nil
}

// parseChatMessages parses a JSON object array where each item may have role/text/content fields.
func parseChatMessages(raw json.RawMessage) []ConversationMessage {
	var items []map[string]interface{}
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil
	}

	var msgs []ConversationMessage
	for _, item := range items {
		role := normalizeRole(fmt.Sprintf("%v", item["role"]))
		text := ""

		// Try multiple text field names
		for _, field := range []string{"text", "rawText", "content", "message", "value"} {
			if v, ok := item[field]; ok {
				if s, ok := v.(string); ok && s != "" {
					text = s
					break
				}
			}
		}

		// Nested content blocks
		if text == "" {
			if v, ok := item["content"]; ok {
				if blocks, ok := v.([]interface{}); ok {
					for _, block := range blocks {
						if m, ok := block.(map[string]interface{}); ok {
							if s, ok := m["text"].(string); ok {
								text += s + " "
							}
						}
					}
					text = strings.TrimSpace(text)
				}
			}
		}

		if text == "" {
			continue
		}

		var ts int64
		if v, ok := item["timestamp"]; ok {
			if f, ok := v.(float64); ok {
				ts = int64(f)
			}
		}

		msgs = append(msgs, ConversationMessage{
			Role:      role,
			Text:      text,
			Timestamp: ts,
		})
	}
	return msgs
}

func normalizeRole(role string) string {
	role = strings.ToLower(role)
	switch role {
	case "user", "human":
		return "user"
	case "assistant", "ai", "bot", "model":
		return "assistant"
	case "tool", "function":
		return "tool"
	case "system":
		return "system"
	default:
		return "assistant"
	}
}

// parseVscdbConversations is a shared helper for VS Code-family IDEs
func parseVscdbConversations(projectDir string, keys []string, likePatterns []string) ([]ParsedConversation, error) {
	vscdbPath := filepath.Join(projectDir, "state.vscdb")

	var allConvs []ParsedConversation

	// Try exact keys first
	for _, key := range keys {
		value, err := queryVscdb(vscdbPath, key)
		if err != nil || value == "" {
			continue
		}
		convs := extractConversationsFromJSON(value)
		allConvs = append(allConvs, convs...)
	}

	// Try LIKE patterns
	for _, pattern := range likePatterns {
		values, err := queryVscdbLike(vscdbPath, pattern)
		if err != nil {
			continue
		}
		for _, value := range values {
			convs := extractConversationsFromJSON(value)
			allConvs = append(allConvs, convs...)
		}
	}

	return allConvs, nil
}

// extractConversationsFromJSON attempts to extract conversations from a JSON string
// that may be an array or an object with various known fields.
func extractConversationsFromJSON(raw string) []ParsedConversation {
	// Try as a top-level object with tabs/sessions/conversations
	var obj map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &obj) == nil {
		// Known container fields
		for _, field := range []string{"tabs", "sessions", "conversations", "chats", "history"} {
			if data, ok := obj[field]; ok {
				return parseConversationArray(data)
			}
		}
	}

	// Try as a direct array of conversations
	var arr []json.RawMessage
	if json.Unmarshal([]byte(raw), &arr) == nil {
		return parseConversationArray([]byte(raw))
	}

	return nil
}

// parseConversationArray parses a JSON array of conversation-like objects.
func parseConversationArray(data json.RawMessage) []ParsedConversation {
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(data, &items); err != nil {
		return nil
	}

	var convs []ParsedConversation
	for i, item := range items {
		// Extract ID
		id := fmt.Sprintf("conv-%d", i)
		if raw, ok := item["id"]; ok {
			var s string
			if json.Unmarshal(raw, &s) == nil {
				id = s
			}
		}

		// Extract title
		title := ""
		for _, field := range []string{"title", "name", "label"} {
			if raw, ok := item[field]; ok {
				var s string
				if json.Unmarshal(raw, &s) == nil && s != "" {
					title = s
					break
				}
			}
		}

		// Extract messages from known message container fields
		var msgs []ConversationMessage
		for _, field := range []string{"messages", "bubbles", "turns", "exchanges", "entries"} {
			if raw, ok := item[field]; ok {
				msgs = parseChatMessages(raw)
				if len(msgs) > 0 {
					break
				}
			}
		}

		// Handle request/response format (Copilot)
		if len(msgs) == 0 {
			if raw, ok := item["turns"]; ok {
				var turns []map[string]json.RawMessage
				if json.Unmarshal(raw, &turns) == nil {
					for _, turn := range turns {
						if req, ok := turn["request"]; ok {
							var s string
							if json.Unmarshal(req, &s) == nil && s != "" {
								msgs = append(msgs, ConversationMessage{Role: "user", Text: s})
							}
						}
						if resp, ok := turn["response"]; ok {
							var s string
							if json.Unmarshal(resp, &s) == nil && s != "" {
								msgs = append(msgs, ConversationMessage{Role: "assistant", Text: s})
							}
						}
					}
				}
			}
		}

		if len(msgs) == 0 {
			continue
		}

		conv := ParsedConversation{
			ID:       id,
			Title:    title,
			Messages: msgs,
		}

		// Extract timestamps
		for _, field := range []string{"startedAt", "createdAt", "timestamp"} {
			if raw, ok := item[field]; ok {
				var ts interface{}
				if json.Unmarshal(raw, &ts) == nil {
					if t := parseTimestamp(ts); t != nil {
						conv.StartedAt = t
						break
					}
				}
			}
		}

		convs = append(convs, conv)
	}

	return convs
}

func parseTimestamp(v interface{}) *time.Time {
	switch val := v.(type) {
	case float64:
		if val > 1e12 { // milliseconds
			t := time.UnixMilli(int64(val))
			return &t
		}
		t := time.Unix(int64(val), 0)
		return &t
	case string:
		if t, err := time.Parse(time.RFC3339, val); err == nil {
			return &t
		}
		if t, err := time.Parse("2006-01-02T15:04:05Z", val); err == nil {
			return &t
		}
	}
	return nil
}
