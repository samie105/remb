package cmd

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/config"
	"github.com/useremb/remb/internal/parsers"
)

var (
	importIDE         string
	importProject     string
	importRembProject string
	importAll         bool
	importDryRun      bool
	importSince       string
	importList        bool
	importLimit       int
)

var importCmd = &cobra.Command{
	Use:   "import",
	Short: "Import AI chat history from local IDE storage into Remb",
	Long: `Import AI chat history from local IDE storage into Remb.

Supported IDEs:
  cursor          Cursor (VS Code fork)
  claude-code     Claude Code CLI
  vscode          VS Code (GitHub Copilot)
  windsurf        Windsurf (Codeium)
  intellij        IntelliJ IDEA
  pycharm         PyCharm
  android-studio  Android Studio
  visual-studio   Visual Studio (Windows)
  zed             Zed
  sublime-text    Sublime Text (LSP-Copilot)

Examples:
  remb import                          # Auto-detect and import
  remb import --list                   # List detected IDEs and projects
  remb import --ide cursor             # Import from Cursor only
  remb import --all --dry-run          # Preview what would be imported
  remb import --since 2025-01-01       # Only import recent conversations`,
	RunE: runImport,
}

func init() {
	importCmd.Flags().StringVar(&importIDE, "ide", "", "Import from a specific IDE only")
	importCmd.Flags().StringVar(&importProject, "project", "", "Import a specific project/workspace by ID")
	importCmd.Flags().StringVar(&importRembProject, "remb-project", "", "Associate imports with this Remb project")
	importCmd.Flags().BoolVar(&importAll, "all", false, "Import all without prompting")
	importCmd.Flags().BoolVar(&importDryRun, "dry-run", false, "Show what would be imported")
	importCmd.Flags().StringVar(&importSince, "since", "", "Only import after this date (YYYY-MM-DD)")
	importCmd.Flags().BoolVar(&importList, "list", false, "List detected IDEs and projects")
	importCmd.Flags().IntVarP(&importLimit, "limit", "l", 100, "Max conversations per project")
}

const (
	batchSize       = 20
	maxEventsPerReq = 100
	dim             = "\033[2m"
	bold            = "\033[1m"
	green           = "\033[32m"
	yellow          = "\033[33m"
	blue            = "\033[34m"
	red             = "\033[31m"
	reset           = "\033[0m"
	checkMark       = "\033[32m✔\033[0m"
)

type projectEntry struct {
	parser  parsers.IDEParser
	project parsers.IDEProject
}

type importItem struct {
	parser  parsers.IDEParser
	project parsers.IDEProject
	conv    parsers.ParsedConversation
}

func runImport(cmd *cobra.Command, args []string) error {
	// Validate options
	if importSince != "" {
		if _, err := time.Parse("2006-01-02", importSince); err != nil {
			return fmt.Errorf("invalid --since format %q, expected YYYY-MM-DD", importSince)
		}
	}
	if importLimit > 500 {
		importLimit = 500
	}

	// Step 1: Detect IDEs
	fmt.Fprintf(os.Stderr, "  Detecting installed IDEs...")

	var ideParsers []parsers.IDEParser
	if importIDE != "" {
		p := parsers.GetParser(parsers.IDESource(importIDE))
		if p == nil {
			allIDs := make([]string, 0)
			for _, pp := range parsers.AllParsers() {
				allIDs = append(allIDs, string(pp.ID()))
			}
			return fmt.Errorf("unknown IDE %q. Supported: %s", importIDE, strings.Join(allIDs, ", "))
		}
		ok, _ := p.Detect()
		if !ok {
			return fmt.Errorf("%s storage not found on this machine", p.DisplayName())
		}
		ideParsers = []parsers.IDEParser{p}
	} else {
		ideParsers = parsers.DetectAvailableIDEs()
	}

	if len(ideParsers) == 0 {
		fmt.Fprintf(os.Stderr, "\n  %sNo supported IDEs detected%s\n", red, reset)
		return nil
	}

	names := make([]string, len(ideParsers))
	for i, p := range ideParsers {
		names[i] = p.DisplayName()
	}
	fmt.Fprintf(os.Stderr, "\r  %s Found %d IDE(s): %s\n", checkMark, len(ideParsers), strings.Join(names, ", "))

	// Step 2: List projects
	var allProjects []projectEntry
	for _, p := range ideParsers {
		projects, err := p.ListProjects()
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s %s: failed to scan\n", yellow+"⚠"+reset, p.DisplayName())
			continue
		}
		for _, proj := range projects {
			if importProject != "" && proj.ID != importProject {
				continue
			}
			allProjects = append(allProjects, projectEntry{parser: p, project: proj})
		}
		fmt.Fprintf(os.Stderr, "  %s %s: %d project(s)\n", checkMark, p.DisplayName(), len(projects))
	}

	if len(allProjects) == 0 {
		fmt.Fprintf(os.Stderr, "\n  %sNo projects with chat history found.%s\n", yellow, reset)
		return nil
	}

	// Step 3: --list mode
	if importList {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintf(os.Stderr, "  %sAvailable IDE Chat History%s\n\n", bold, reset)

		lastIDE := ""
		for _, pe := range allProjects {
			id := string(pe.parser.ID())
			if id != lastIDE {
				fmt.Fprintf(os.Stderr, "  %s%s%s\n", blue, pe.parser.DisplayName(), reset)
				lastIDE = id
			}
			date := pe.project.LastModified.Format("2006-01-02")
			ws := ""
			if pe.project.WorkspacePath != "" {
				ws = dim + " → " + pe.project.WorkspacePath + reset
			}
			short := pe.project.ID
			if len(short) > 12 {
				short = short[:12]
			}
			fmt.Fprintf(os.Stderr, "    %s%s%s %s %s%s%s%s\n", green, short, reset, pe.project.Name, dim, date, reset, ws)
		}
		fmt.Fprintf(os.Stderr, "\n  %s%d total project(s) across %d IDE(s)%s\n", dim, len(allProjects), len(ideParsers), reset)
		return nil
	}

	// Step 4: Parse conversations
	fmt.Fprintln(os.Stderr)
	var queue []importItem
	totalMessages := 0

	sinceDate := time.Time{}
	if importSince != "" {
		sinceDate, _ = time.Parse("2006-01-02", importSince)
	}

	for _, pe := range allProjects {
		convs, err := pe.parser.ParseConversations(pe.project.ID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s %s / %s: failed to parse\n", yellow+"⚠"+reset, pe.parser.DisplayName(), pe.project.Name)
			continue
		}

		// Filter by --since
		if !sinceDate.IsZero() {
			filtered := make([]parsers.ParsedConversation, 0, len(convs))
			for _, c := range convs {
				if c.StartedAt != nil && c.StartedAt.Before(sinceDate) {
					continue
				}
				filtered = append(filtered, c)
			}
			convs = filtered
		}

		// Apply limit
		if len(convs) > importLimit {
			convs = convs[:importLimit]
		}

		msgCount := 0
		for _, c := range convs {
			queue = append(queue, importItem{parser: pe.parser, project: pe.project, conv: c})
			msgCount += len(c.Messages)
			totalMessages += len(c.Messages)
		}

		fmt.Fprintf(os.Stderr, "  %s %s / %s: %d conversations (%d messages)\n",
			checkMark, pe.parser.DisplayName(), pe.project.Name, len(convs), msgCount)
	}

	if len(queue) == 0 {
		fmt.Fprintf(os.Stderr, "\n  %sNo conversations to import.%s\n", yellow, reset)
		return nil
	}

	// Step 5: Summary
	fmt.Fprintln(os.Stderr)
	fmt.Fprintf(os.Stderr, "  %sImport Summary%s\n", bold, reset)
	fmt.Fprintf(os.Stderr, "  %s%d%s conversations, %s%d%s messages\n",
		green, len(queue), reset, green, totalMessages, reset)
	if importRembProject != "" {
		fmt.Fprintf(os.Stderr, "  Target project: %s%s%s\n", blue, importRembProject, reset)
	}

	// Step 6: Dry run
	if importDryRun {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintf(os.Stderr, "  %sDry run — no data sent. Remove --dry-run to import.%s\n", yellow, reset)
		limit := 5
		if len(queue) < limit {
			limit = len(queue)
		}
		fmt.Fprintln(os.Stderr)
		for _, item := range queue[:limit] {
			title := item.conv.Title
			if title == "" && len(item.conv.Messages) > 0 {
				title = item.conv.Messages[0].Text
				if len(title) > 80 {
					title = title[:80]
				}
			}
			date := "unknown"
			if item.conv.StartedAt != nil {
				date = item.conv.StartedAt.Format("2006-01-02")
			}
			fmt.Fprintf(os.Stderr, "  %s%s%s %s%s%s %s\n", dim, date, reset, blue, item.parser.DisplayName(), reset, title)
		}
		if len(queue) > 5 {
			fmt.Fprintf(os.Stderr, "  %s... and %d more%s\n", dim, len(queue)-5, reset)
		}
		return nil
	}

	// Step 7: Import
	// Resolve project slug
	projectSlug := importRembProject
	if projectSlug == "" {
		cfg := config.FindProjectConfig("")
		if cfg != nil && cfg.Config.Project != "" {
			projectSlug = cfg.Config.Project
		}
	}

	client, err := api.NewClient()
	if err != nil {
		return err
	}

	var (
		imported int
		skipped  int
		failed   int
		mu       sync.Mutex
	)

	fmt.Fprintf(os.Stderr, "\n  Importing 0/%d...", len(queue))

	for i := 0; i < len(queue); i += batchSize {
		end := i + batchSize
		if end > len(queue) {
			end = len(queue)
		}
		batch := queue[i:end]

		var wg sync.WaitGroup
		for _, item := range batch {
			wg.Add(1)
			go func(it importItem) {
				defer wg.Done()

				events := parsers.ConversationToEvents(it.conv)
				if len(events) == 0 {
					mu.Lock()
					skipped++
					mu.Unlock()
					return
				}

				if len(events) > maxEventsPerReq {
					events = events[:maxEventsPerReq]
				}

				// Convert to API types
				smartEvents := make([]api.SmartEvent, len(events))
				for j, e := range events {
					smartEvents[j] = api.SmartEvent{
						Type:      e.Type,
						Text:      e.Text,
						Path:      e.Path,
						Name:      e.Name,
						Timestamp: e.Timestamp,
					}
				}

				meta := map[string]interface{}{
					"import_source":         string(it.parser.ID()),
					"import_project_name":   it.project.Name,
					"import_workspace_path": it.project.WorkspacePath,
					"conversation_id":       it.conv.ID,
					"conversation_title":    it.conv.Title,
					"message_count":         len(it.conv.Messages),
				}
				if it.conv.StartedAt != nil {
					meta["started_at"] = it.conv.StartedAt.Format(time.RFC3339)
				}

				resp, err := client.LogSmartConversation(api.LogSmartConversationRequest{
					Events:      smartEvents,
					ProjectSlug: projectSlug,
					IDESource:   string(it.parser.ID()),
					Metadata:    meta,
				})

				mu.Lock()
				if err != nil {
					failed++
				} else if resp.Deduplicated {
					skipped++
				} else {
					imported++
				}
				mu.Unlock()
			}(item)
		}
		wg.Wait()

		fmt.Fprintf(os.Stderr, "\r  Importing %d/%d... (%d new, %d skipped)", end, len(queue), imported, skipped)
	}

	failStr := "0"
	if failed > 0 {
		failStr = fmt.Sprintf("%s%d%s", red, failed, reset)
	}
	fmt.Fprintf(os.Stderr, "\r  %s Import complete: %s%d%s imported, %s%d%s skipped, %s failed    \n",
		checkMark, green, imported, reset, yellow, skipped, reset, failStr)

	if imported > 0 {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintf(os.Stderr, "  %sView imported history: remb history%s\n", dim, reset)
		if importRembProject == "" {
			fmt.Fprintf(os.Stderr, "  %sTip: Use --remb-project <slug> to associate imports%s\n", dim, reset)
		}
	}

	return nil
}
