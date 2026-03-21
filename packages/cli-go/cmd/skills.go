package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/useremb/remb/internal/config"
	"github.com/useremb/remb/internal/output"
)

// ── Constants ────────────────────────────────────────────────────────

const (
	skillsRepoOwner = "samie105"
	skillsRepoName  = "skills"
	githubAPI       = "https://api.github.com"
	githubRaw       = "https://raw.githubusercontent.com"
)

var knownSkills = []string{
	"remb-setup",
	"remb-context",
	"remb-memory",
	"remb-scan",
	"remb-import",
	"remb-cross-project",
}

// ── IDE targets ──────────────────────────────────────────────────────

type ideTarget struct {
	ide       string
	dir       func(cwd, skillName string) string
	filename  func(skillName string) string
	transform func(content, skillName string) string
}

var ideTargets = []ideTarget{
	{
		ide:      "claude",
		dir:      func(cwd, skillName string) string { return filepath.Join(cwd, ".claude", "commands", skillName) },
		filename: func(_ string) string { return "SKILL.md" },
	},
	{
		ide:      "vscode",
		dir:      func(cwd, _ string) string { return filepath.Join(cwd, ".github", "copilot-skills") },
		filename: func(skillName string) string { return skillName + ".md" },
		transform: func(content, _ string) string {
			// Prepend applyTo to existing frontmatter
			yamlEnd := strings.Index(content[4:], "---")
			if yamlEnd == -1 {
				return content
			}
			fm := content[:4+yamlEnd+3]
			body := content[4+yamlEnd+3:]
			return strings.Replace(fm, "---\n", "---\napplyTo: '**'\n", 1) + body
		},
	},
	{
		ide:      "cursor",
		dir:      func(cwd, _ string) string { return filepath.Join(cwd, ".cursor", "rules") },
		filename: func(skillName string) string { return skillName + ".mdc" },
		transform: func(content, skillName string) string {
			parsed := parseFrontmatterGo(content)
			desc := parsed.description
			if desc == "" {
				desc = skillName
			}
			return fmt.Sprintf("---\ndescription: %s\nglobs: **\nalwaysApply: true\n---\n\n%s", desc, parsed.body)
		},
	},
	{
		ide:      "windsurf",
		dir:      func(cwd, _ string) string { return filepath.Join(cwd, ".windsurf", "rules") },
		filename: func(skillName string) string { return skillName + ".md" },
	},
}

// ── Frontmatter parser ───────────────────────────────────────────────

type parsedFrontmatter struct {
	name        string
	version     string
	description string
	body        string
}

func parseFrontmatterGo(content string) parsedFrontmatter {
	if !strings.HasPrefix(content, "---") {
		return parsedFrontmatter{body: content}
	}
	endIdx := strings.Index(content[3:], "---")
	if endIdx == -1 {
		return parsedFrontmatter{body: content}
	}

	yamlBlock := strings.TrimSpace(content[3 : 3+endIdx])
	body := strings.TrimSpace(content[3+endIdx+3:])
	result := parsedFrontmatter{body: body}

	for _, line := range strings.Split(yamlBlock, "\n") {
		colonIdx := strings.Index(line, ":")
		if colonIdx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:colonIdx])
		value := strings.TrimSpace(line[colonIdx+1:])
		// Strip quotes
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		switch key {
		case "name":
			result.name = value
		case "version":
			result.version = value
		case "description":
			result.description = value
		}
	}

	return result
}

// ── GitHub fetch ─────────────────────────────────────────────────────

type githubDirEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type skillInfo struct {
	name        string
	description string
	version     string
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

func fetchSkillsListGo() ([]skillInfo, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/contents", githubAPI, skillsRepoOwner, skillsRepoName)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var entries []githubDirEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, fmt.Errorf("decode error: %w", err)
	}

	var skills []skillInfo
	for _, entry := range entries {
		if entry.Type != "dir" || !strings.HasPrefix(entry.Name, "remb-") {
			continue
		}
		content, err := fetchSkillContentGo(entry.Name)
		if err != nil {
			skills = append(skills, skillInfo{name: entry.Name, description: "Unable to fetch", version: "unknown"})
			continue
		}
		fm := parseFrontmatterGo(content)
		desc := fm.description
		if desc == "" {
			desc = "No description"
		}
		ver := fm.version
		if ver == "" {
			ver = "unknown"
		}
		skills = append(skills, skillInfo{name: entry.Name, description: desc, version: ver})
	}

	return skills, nil
}

func fetchSkillContentGo(skillName string) (string, error) {
	url := fmt.Sprintf("%s/%s/%s/main/%s/SKILL.md", githubRaw, skillsRepoOwner, skillsRepoName, skillName)
	resp, err := httpClient.Get(url)
	if err != nil {
		return "", fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d for %s", resp.StatusCode, skillName)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// ── IDE detection ────────────────────────────────────────────────────

func detectIDEsForSkills(cwd string) []string {
	var detected []string

	term := strings.ToLower(os.Getenv("TERM_PROGRAM"))
	switch term {
	case "vscode":
		detected = append(detected, "vscode")
	case "cursor":
		detected = append(detected, "cursor")
	case "windsurf":
		detected = append(detected, "windsurf")
	case "claude":
		detected = append(detected, "claude")
	}
	if os.Getenv("VSCODE_PID") != "" && !contains(detected, "vscode") {
		detected = append(detected, "vscode")
	}
	if os.Getenv("CLAUDE_CODE") == "1" && !contains(detected, "claude") {
		detected = append(detected, "claude")
	}

	// Check existing IDE directories
	checks := []struct {
		paths []string
		ide   string
	}{
		{[]string{".github"}, "vscode"},
		{[]string{".cursor"}, "cursor"},
		{[]string{".windsurf", ".windsurfrules"}, "windsurf"},
		{[]string{"CLAUDE.md", ".claude"}, "claude"},
	}
	for _, c := range checks {
		for _, p := range c.paths {
			if _, err := os.Stat(filepath.Join(cwd, p)); err == nil {
				if !contains(detected, c.ide) {
					detected = append(detected, c.ide)
				}
				break
			}
		}
	}

	if len(detected) == 0 {
		return []string{"vscode", "cursor", "windsurf", "claude"}
	}
	return detected
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

// ── Config: track installed skills ───────────────────────────────────

func getInstalledSkillsGo(cwd string) []string {
	cfg := config.FindProjectConfig(cwd)
	if cfg == nil {
		return nil
	}

	raw, err := os.ReadFile(filepath.Join(cfg.Dir, config.ConfigFilename))
	if err != nil {
		return nil
	}

	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "skills:") {
			value := strings.TrimSpace(trimmed[len("skills:"):])
			if value == "" {
				return nil
			}
			parts := strings.Split(value, ",")
			var result []string
			for _, p := range parts {
				s := strings.TrimSpace(p)
				if s != "" {
					result = append(result, s)
				}
			}
			return result
		}
	}
	return nil
}

func updateInstalledSkillsGo(cwd string, skills []string) {
	cfg := config.FindProjectConfig(cwd)
	if cfg == nil {
		return
	}

	configPath := filepath.Join(cfg.Dir, config.ConfigFilename)
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return
	}

	skillsLine := "skills: " + strings.Join(skills, ", ")
	lines := strings.Split(string(raw), "\n")
	found := false
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "skills:") {
			lines[i] = skillsLine
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, skillsLine)
	}

	content := strings.Join(lines, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	os.WriteFile(configPath, []byte(content), 0o644)
}

// ── Install/Uninstall ────────────────────────────────────────────────

func installSkillForIDEGo(cwd, skillName, content string, target ideTarget) (string, error) {
	dir := target.dir(cwd, skillName)
	filename := target.filename(skillName)
	filePath := filepath.Join(dir, filename)

	finalContent := content
	if target.transform != nil {
		finalContent = target.transform(content, skillName)
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(filePath, []byte(finalContent), 0o644); err != nil {
		return "", err
	}
	return filePath, nil
}

func uninstallSkillForIDEGo(cwd, skillName string, target ideTarget) bool {
	dir := target.dir(cwd, skillName)
	filename := target.filename(skillName)
	filePath := filepath.Join(dir, filename)

	if _, err := os.Stat(filePath); err != nil {
		return false
	}
	os.Remove(filePath)

	// Clean up empty directory
	entries, err := os.ReadDir(dir)
	if err == nil && len(entries) == 0 {
		os.Remove(dir)
	}

	return true
}

// ── Gitignore ────────────────────────────────────────────────────────

func addSkillsToGitignoreGo(cwd string) {
	gitignorePath := filepath.Join(cwd, ".gitignore")
	raw, err := os.ReadFile(gitignorePath)
	if err != nil {
		return
	}

	if strings.Contains(string(raw), ".github/copilot-skills/") {
		return
	}

	addition := "\n# Remb skills (managed by remb skills add)\n.github/copilot-skills/\n.claude/commands/remb-*/\n"
	os.WriteFile(gitignorePath, append(raw, []byte(addition)...), 0o644)
}

// ── Cobra commands ───────────────────────────────────────────────────

var skillsCmd = &cobra.Command{
	Use:   "skills",
	Short: "Install and manage Remb skills for your IDE",
	Long: `Install and manage Remb skills for your IDE.

Skills are modular AI agent knowledge packages that teach your
coding assistant how to use Remb effectively.

Examples:
  remb skills list                  List available skills
  remb skills add remb-context      Install a skill
  remb skills add --all             Install all skills
  remb skills remove remb-context   Remove a skill
  remb skills update                Update all installed skills`,
}

var skillsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available Remb skills",
	RunE: func(cmd *cobra.Command, args []string) error {
		output.Info("Fetching skills from GitHub...")
		skills, err := fetchSkillsListGo()
		if err != nil {
			return fmt.Errorf("failed to list skills: %w", err)
		}

		cwd, _ := os.Getwd()
		installed := getInstalledSkillsGo(cwd)

		fmt.Println()
		fmt.Println(output.Bold("Available Remb Skills"))
		fmt.Println(output.Dim(strings.Repeat("─", 60)))

		for _, skill := range skills {
			status := ""
			for _, inst := range installed {
				if inst == skill.name {
					status = " \033[32m[installed]\033[0m"
					break
				}
			}
			fmt.Printf("  %s%s  %s\n", output.Cyan(skill.name), status, output.Dim("v"+skill.version))
			fmt.Printf("    %s\n\n", skill.description)
		}

		fmt.Println(output.Dim("Install a skill: " + output.Bold("remb skills add <name>")))
		return nil
	},
}

var skillsAddAll bool
var skillsAddIDE string

var skillsAddCmd = &cobra.Command{
	Use:   "add [name]",
	Short: "Install a Remb skill into your IDE",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, _ := os.Getwd()

		if len(args) == 0 && !skillsAddAll {
			output.Error("Specify a skill name or use --all to install all skills.")
			fmt.Println(output.Dim("  Run `remb skills list` to see available skills."))
			os.Exit(1)
		}

		var skillNames []string
		if skillsAddAll {
			skillNames = knownSkills
		} else {
			skillNames = []string{args[0]}
		}

		// Determine target IDEs
		detectedIDEs := detectIDEsForSkills(cwd)
		var targets []ideTarget
		if skillsAddIDE != "" {
			for _, t := range ideTargets {
				if t.ide == skillsAddIDE {
					targets = append(targets, t)
				}
			}
		} else {
			for _, t := range ideTargets {
				if contains(detectedIDEs, t.ide) {
					targets = append(targets, t)
				}
			}
		}

		if len(targets) == 0 {
			return fmt.Errorf("no target IDEs detected. Use --ide to specify one")
		}

		installed := getInstalledSkillsGo(cwd)

		for _, skillName := range skillNames {
			output.Info(fmt.Sprintf("Downloading %s...", output.Cyan(skillName)))
			content, err := fetchSkillContentGo(skillName)
			if err != nil {
				output.Error(fmt.Sprintf("Failed to install %s: %s", skillName, err))
				continue
			}

			for _, target := range targets {
				filePath, err := installSkillForIDEGo(cwd, skillName, content, target)
				if err != nil {
					output.Error(fmt.Sprintf("Failed to install for %s: %s", target.ide, err))
					continue
				}
				rel, _ := filepath.Rel(cwd, filePath)
				fmt.Printf("  \033[32m✓\033[0m %s: %s\n", target.ide, output.Dim(rel))
			}

			if !contains(installed, skillName) {
				installed = append(installed, skillName)
			}
			output.Success(fmt.Sprintf("Installed %s", skillName))
		}

		updateInstalledSkillsGo(cwd, installed)
		addSkillsToGitignoreGo(cwd)
		return nil
	},
}

var skillsRemoveCmd = &cobra.Command{
	Use:   "remove <name>",
	Short: "Remove an installed Remb skill",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, _ := os.Getwd()
		name := args[0]
		removed := false

		for _, target := range ideTargets {
			if uninstallSkillForIDEGo(cwd, name, target) {
				fmt.Printf("  \033[32m✓\033[0m Removed from %s\n", target.ide)
				removed = true
			}
		}

		if removed {
			installed := getInstalledSkillsGo(cwd)
			var filtered []string
			for _, s := range installed {
				if s != name {
					filtered = append(filtered, s)
				}
			}
			updateInstalledSkillsGo(cwd, filtered)
			output.Success(fmt.Sprintf("Removed %s", name))
		} else {
			output.Warn(fmt.Sprintf("Skill %s was not found in any IDE directory.", name))
		}

		return nil
	},
}

var skillsUpdateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update all installed skills to latest versions",
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, _ := os.Getwd()
		installed := getInstalledSkillsGo(cwd)

		if len(installed) == 0 {
			output.Info("No skills installed. Run `remb skills add <name>` to install one.")
			return nil
		}

		output.Info(fmt.Sprintf("Updating %d skill(s)...", len(installed)))

		detectedIDEs := detectIDEsForSkills(cwd)
		var targets []ideTarget
		for _, t := range ideTargets {
			if contains(detectedIDEs, t.ide) {
				targets = append(targets, t)
			}
		}

		for _, skillName := range installed {
			content, err := fetchSkillContentGo(skillName)
			if err != nil {
				output.Error(fmt.Sprintf("Failed to update %s: %s", skillName, err))
				continue
			}
			for _, target := range targets {
				installSkillForIDEGo(cwd, skillName, content, target)
			}
			output.Success(fmt.Sprintf("Updated %s", skillName))
		}

		return nil
	},
}

func init() {
	skillsAddCmd.Flags().BoolVar(&skillsAddAll, "all", false, "Install all available skills")
	skillsAddCmd.Flags().StringVar(&skillsAddIDE, "ide", "", "Target specific IDE: vscode, cursor, windsurf, claude")

	skillsCmd.AddCommand(skillsListCmd)
	skillsCmd.AddCommand(skillsAddCmd)
	skillsCmd.AddCommand(skillsRemoveCmd)
	skillsCmd.AddCommand(skillsUpdateCmd)
}

// ── Init integration ─────────────────────────────────────────────────

var recommendedSkills = []string{"remb-context", "remb-memory", "remb-scan"}

// installSkillsAfterInit is called from `remb init` to install recommended skills.
func installSkillsAfterInit(cwd, ide string) {
	detectedIDEs := []string{ide}
	if ide == "all" {
		detectedIDEs = []string{"vscode", "cursor", "windsurf", "claude"}
	}

	var targets []ideTarget
	for _, t := range ideTargets {
		if contains(detectedIDEs, t.ide) {
			targets = append(targets, t)
		}
	}
	if len(targets) == 0 {
		return
	}

	var installed []string
	for _, skillName := range recommendedSkills {
		content, err := fetchSkillContentGo(skillName)
		if err != nil {
			output.Warn(fmt.Sprintf("Could not install skill: %s", skillName))
			continue
		}
		for _, target := range targets {
			installSkillForIDEGo(cwd, skillName, content, target)
		}
		installed = append(installed, skillName)
		output.Success(fmt.Sprintf("Installed skill: %s", skillName))
	}

	if len(installed) > 0 {
		updateInstalledSkillsGo(cwd, installed)
		addSkillsToGitignoreGo(cwd)
	}
}
