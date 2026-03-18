package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/richie/remb/internal/api"
	"github.com/richie/remb/internal/config"
	"github.com/spf13/cobra"
)

var (
	histDate    string
	histFrom    string
	histTo      string
	histLimit   int
	histProject string
	histFormat  string
)

var historyCmd = &cobra.Command{
	Use:   "history",
	Short: "View conversation history — what AI discussed and did across sessions",
	RunE:  runHistory,
}

func init() {
	historyCmd.Flags().StringVarP(&histDate, "date", "d", "", "Filter by specific date (YYYY-MM-DD)")
	historyCmd.Flags().StringVar(&histFrom, "from", "", "Start date filter (YYYY-MM-DD)")
	historyCmd.Flags().StringVar(&histTo, "to", "", "End date filter (YYYY-MM-DD)")
	historyCmd.Flags().IntVarP(&histLimit, "limit", "l", 20, "Max entries to show")
	historyCmd.Flags().StringVarP(&histProject, "project", "p", "", "Filter by project slug")
	historyCmd.Flags().StringVar(&histFormat, "format", "timeline", "Output format: timeline, markdown, json")
}

func runHistory(cmd *cobra.Command, args []string) error {
	client, err := api.NewClient()
	if err != nil {
		return err
	}

	// Resolve project slug
	projectSlug := histProject
	if projectSlug == "" {
		cfg := config.FindProjectConfig("")
		if cfg != nil && cfg.Config.Project != "" {
			projectSlug = cfg.Config.Project
		}
	}

	// Build query params
	params := map[string]string{}
	if projectSlug != "" {
		params["projectSlug"] = projectSlug
	}
	if histDate != "" {
		params["startDate"] = histDate + "T00:00:00Z"
		params["endDate"] = histDate + "T23:59:59Z"
	} else {
		if histFrom != "" {
			params["startDate"] = histFrom + "T00:00:00Z"
		}
		if histTo != "" {
			params["endDate"] = histTo + "T23:59:59Z"
		}
	}
	if histLimit > 0 {
		params["limit"] = fmt.Sprintf("%d", histLimit)
	}

	result, err := client.GetConversationHistory(params)
	if err != nil {
		handleAPIError(err)
		return nil
	}

	switch histFormat {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(result.Entries)

	case "markdown":
		printHistoryMarkdown(result.Entries)
		return nil

	default:
		printHistoryTimeline(result)
		return nil
	}
}

func printHistoryTimeline(result *api.ConversationHistoryResponse) {
	if len(result.Entries) == 0 {
		fmt.Fprintf(os.Stderr, "  %sNo conversation history found.%s\n", "\033[2m", "\033[0m")
		return
	}

	fmt.Fprintf(os.Stderr, "\n  %sConversation History%s\n", "\033[1m", "\033[0m")
	fmt.Fprintf(os.Stderr, "  %s%d entries%s\n\n", "\033[2m", result.Total, "\033[0m")

	// Group by date
	grouped := groupByDate(result.Entries)
	dates := sortedKeys(grouped)

	for _, date := range dates {
		entries := grouped[date]
		fmt.Fprintf(os.Stderr, "  \033[1;34m%s\033[0m\n", date)
		for _, e := range entries {
			time := e.CreatedAt[11:16]
			icon := "\033[36m●\033[0m" // cyan dot = summary
			if e.Type == "tool_call" {
				icon = "\033[33m⚡\033[0m" // yellow bolt = tool call
			} else if e.Type == "milestone" {
				icon = "\033[32m◆\033[0m" // green diamond = milestone
			}
			src := ""
			if e.Source != "mcp" {
				src = fmt.Sprintf(" \033[2m[%s]\033[0m", e.Source)
			}
			fmt.Fprintf(os.Stderr, "    \033[2m%s\033[0m %s%s %s\n", time, icon, src, e.Content)
		}
		fmt.Fprintln(os.Stderr)
	}
}

func printHistoryMarkdown(entries []api.ConversationEntry) {
	if len(entries) == 0 {
		fmt.Println("No conversation history found.")
		return
	}

	// Reverse to chronological
	reversed := make([]api.ConversationEntry, len(entries))
	copy(reversed, entries)
	sort.Slice(reversed, func(i, j int) bool {
		return reversed[i].CreatedAt < reversed[j].CreatedAt
	})

	grouped := groupByDate(reversed)
	dates := sortedKeys(grouped)

	fmt.Println("# Conversation History")
	fmt.Println()
	for _, date := range dates {
		dayEntries := grouped[date]
		fmt.Printf("## %s\n\n", date)
		for _, e := range dayEntries {
			time := e.CreatedAt[11:16]
			icon := "💬"
			if e.Type == "tool_call" {
				icon = "🔧"
			} else if e.Type == "milestone" {
				icon = "🏁"
			}
			src := ""
			if e.Source != "mcp" {
				src = fmt.Sprintf(" [%s]", e.Source)
			}
			fmt.Printf("- **%s** %s%s %s\n", time, icon, src, e.Content)
		}
		fmt.Println()
	}
}

func groupByDate(entries []api.ConversationEntry) map[string][]api.ConversationEntry {
	grouped := map[string][]api.ConversationEntry{}
	for _, e := range entries {
		date := e.CreatedAt[:10]
		grouped[date] = append(grouped[date], e)
	}
	return grouped
}

func sortedKeys(m map[string][]api.ConversationEntry) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
