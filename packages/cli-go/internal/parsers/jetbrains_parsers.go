package parsers

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

// jetbrainsConfig holds IDE-specific paths for JetBrains family.
type jetbrainsConfig struct {
	appDirPrefix  string // e.g. "IntelliJIdea", "PyCharm", "AndroidStudio"
	chatFilePaths []string
}

var (
	intellijConfig = jetbrainsConfig{
		appDirPrefix:  "IntelliJIdea",
		chatFilePaths: []string{"workspace", "ChatSessionState"},
	}
	pycharmConfig = jetbrainsConfig{
		appDirPrefix:  "PyCharm",
		chatFilePaths: []string{"options", "ai_assistant.xml"},
	}
	androidStudioConfig = jetbrainsConfig{
		appDirPrefix:  "AndroidStudio",
		chatFilePaths: []string{"workspace", "GeminiChat"},
	}
)

// ── IntelliJ ──

type IntelliJParser struct{}

func (p *IntelliJParser) ID() IDESource       { return IDEIntelliJ }
func (p *IntelliJParser) DisplayName() string { return "IntelliJ IDEA" }
func (p *IntelliJParser) Detect() (bool, error) {
	return detectJetBrains(intellijConfig), nil
}
func (p *IntelliJParser) ListProjects() ([]IDEProject, error) {
	return listJetBrainsProjects(intellijConfig)
}
func (p *IntelliJParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	return parseJetBrainsConversations(intellijConfig, projectID)
}

// ── PyCharm ──

type PyCharmParser struct{}

func (p *PyCharmParser) ID() IDESource       { return IDEPyCharm }
func (p *PyCharmParser) DisplayName() string { return "PyCharm" }
func (p *PyCharmParser) Detect() (bool, error) {
	return detectJetBrains(pycharmConfig), nil
}
func (p *PyCharmParser) ListProjects() ([]IDEProject, error) {
	return listJetBrainsProjects(pycharmConfig)
}
func (p *PyCharmParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	return parseJetBrainsConversations(pycharmConfig, projectID)
}

// ── Android Studio ──

type AndroidStudioParser struct{}

func (p *AndroidStudioParser) ID() IDESource       { return IDEAndroidStudio }
func (p *AndroidStudioParser) DisplayName() string { return "Android Studio" }
func (p *AndroidStudioParser) Detect() (bool, error) {
	return detectJetBrains(androidStudioConfig), nil
}
func (p *AndroidStudioParser) ListProjects() ([]IDEProject, error) {
	return listJetBrainsProjects(androidStudioConfig)
}
func (p *AndroidStudioParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	return parseJetBrainsConversations(androidStudioConfig, projectID)
}

// ── Shared JetBrains logic ──

func jetbrainsBaseDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "JetBrains")
	case "linux":
		return filepath.Join(home, ".config", "JetBrains")
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, "JetBrains")
	default:
		return ""
	}
}

func findVersionDirs(cfg jetbrainsConfig) []string {
	base := jetbrainsBaseDir()
	if base == "" {
		return nil
	}

	entries, err := os.ReadDir(base)
	if err != nil {
		return nil
	}

	var dirs []string
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), cfg.appDirPrefix) {
			dirs = append(dirs, filepath.Join(base, entry.Name()))
		}
	}

	// Sort by version (newest first)
	sort.Sort(sort.Reverse(sort.StringSlice(dirs)))
	return dirs
}

func detectJetBrains(cfg jetbrainsConfig) bool {
	return len(findVersionDirs(cfg)) > 0
}

func listJetBrainsProjects(cfg jetbrainsConfig) ([]IDEProject, error) {
	dirs := findVersionDirs(cfg)

	var projects []IDEProject
	for _, dir := range dirs {
		version := filepath.Base(dir)
		info, _ := os.Stat(dir)
		lastMod := time.Time{}
		if info != nil {
			lastMod = info.ModTime()
		}

		// Check if chat files exist
		chatFile := filepath.Join(append([]string{dir}, cfg.chatFilePaths...)...)
		if _, err := findXMLFiles(chatFile); err == nil {
			projects = append(projects, IDEProject{
				ID:           version,
				Name:         fmt.Sprintf("%s %s", cfg.appDirPrefix, version),
				StoragePath:  dir,
				LastModified: lastMod,
			})
		}
	}
	return projects, nil
}

func parseJetBrainsConversations(cfg jetbrainsConfig, projectID string) ([]ParsedConversation, error) {
	base := jetbrainsBaseDir()
	dir := filepath.Join(base, projectID)

	chatPath := filepath.Join(append([]string{dir}, cfg.chatFilePaths...)...)

	files, err := findXMLFiles(chatPath)
	if err != nil {
		return nil, err
	}

	var allConvs []ParsedConversation
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		convs := extractConversationsFromXML(string(data))
		allConvs = append(allConvs, convs...)
	}
	return allConvs, nil
}

// findXMLFiles returns XML files at the given path. If it's a directory, looks inside.
func findXMLFiles(path string) ([]string, error) {
	info, err := os.Stat(path)
	if err != nil {
		// Try with .xml extension
		info, err = os.Stat(path + ".xml")
		if err == nil {
			return []string{path + ".xml"}, nil
		}
		return nil, err
	}

	if !info.IsDir() {
		return []string{path}, nil
	}

	matches, err := filepath.Glob(filepath.Join(path, "*.xml"))
	if err != nil {
		return nil, err
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("no XML files in %s", path)
	}
	return matches, nil
}

// extractConversationsFromXML uses regex to parse conversations from JetBrains XML.
// JetBrains AI chat XML varies by product but generally has message elements with role attributes.
func extractConversationsFromXML(xmlContent string) []ParsedConversation {
	// Pattern 1: <message role="...">text</message>
	msgRe := regexp.MustCompile(`(?s)<message[^>]*\brole\s*=\s*"([^"]*)"[^>]*>(.*?)</message>`)
	matches := msgRe.FindAllStringSubmatch(xmlContent, -1)

	if len(matches) > 0 {
		var msgs []ConversationMessage
		for _, m := range matches {
			role := normalizeRole(m[1])
			text := cleanXMLContent(m[2])
			if text != "" {
				msgs = append(msgs, ConversationMessage{Role: role, Text: text})
			}
		}
		if len(msgs) > 0 {
			return []ParsedConversation{{
				ID:       "jetbrains-xml",
				Messages: msgs,
			}}
		}
	}

	// Pattern 2: <content> tags with role attributes
	contentRe := regexp.MustCompile(`(?s)<content[^>]*\brole\s*=\s*"([^"]*)"[^>]*>(.*?)</content>`)
	matches = contentRe.FindAllStringSubmatch(xmlContent, -1)

	if len(matches) > 0 {
		var msgs []ConversationMessage
		for _, m := range matches {
			role := normalizeRole(m[1])
			text := cleanXMLContent(m[2])
			if text != "" {
				msgs = append(msgs, ConversationMessage{Role: role, Text: text})
			}
		}
		if len(msgs) > 0 {
			return []ParsedConversation{{
				ID:       "jetbrains-xml",
				Messages: msgs,
			}}
		}
	}

	// Pattern 3: Any element with role attribute and text content (generic fallback)
	genericRe := regexp.MustCompile(`(?s)<(\w+)[^>]*\brole\s*=\s*"([^"]*)"[^>]*>(.*?)</\1>`)
	matches = genericRe.FindAllStringSubmatch(xmlContent, -1)

	if len(matches) > 0 {
		var msgs []ConversationMessage
		for _, m := range matches {
			role := normalizeRole(m[2])
			text := cleanXMLContent(m[3])
			if text != "" {
				msgs = append(msgs, ConversationMessage{Role: role, Text: text})
			}
		}
		if len(msgs) > 0 {
			return []ParsedConversation{{
				ID:       "jetbrains-xml",
				Messages: msgs,
			}}
		}
	}

	return nil
}

func cleanXMLContent(content string) string {
	// Strip CDATA wrappers
	content = strings.ReplaceAll(content, "<![CDATA[", "")
	content = strings.ReplaceAll(content, "]]>", "")
	// Strip child XML tags
	tagRe := regexp.MustCompile(`<[^>]+>`)
	content = tagRe.ReplaceAllString(content, "")
	return strings.TrimSpace(content)
}
