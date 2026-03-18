package cmd

import (
	"fmt"
	"os"
	"strconv"

	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/output"
	"github.com/spf13/cobra"
)

var getProject string
var getFeature string
var getLimit string
var getFormat string

var getCmd = &cobra.Command{
	Use:   "get",
	Short: "Retrieve context entries with optional filtering",
	RunE:  runGet,
}

func init() {
	getCmd.Flags().StringVarP(&getProject, "project", "p", "", "Project slug (reads from .remb.yml if omitted)")
	getCmd.Flags().StringVarP(&getFeature, "feature", "f", "", "Filter by feature name")
	getCmd.Flags().StringVarP(&getLimit, "limit", "l", "10", "Max entries to return")
	getCmd.Flags().StringVar(&getFormat, "format", "table", "Output format: json, table, markdown")
}

func runGet(cmd *cobra.Command, args []string) error {
	projectSlug := resolveProject(getProject)
	limit, err := strconv.Atoi(getLimit)
	if err != nil || limit <= 0 {
		limit = 10
	}

	fmt.Print("⠋ Fetching context...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	result, err := client.GetContext(projectSlug, getFeature, limit)

	fmt.Print("\r\033[K")

	if err != nil {
		handleAPIError(err)
	}

	if len(result.Entries) == 0 {
		if getFeature != "" {
			output.Info(fmt.Sprintf("No entries found for feature %s in %s.",
				output.Bold(getFeature), output.Bold(projectSlug)))
		} else {
			output.Info(fmt.Sprintf("No entries found for project %s.", output.Bold(projectSlug)))
		}
		return nil
	}

	// Convert to output entries
	entries := make([]output.Entry, len(result.Entries))
	for i, e := range result.Entries {
		entries[i] = output.Entry{
			ID:        e.ID,
			Feature:   e.Feature,
			Content:   e.Content,
			EntryType: e.EntryType,
			Source:    e.Source,
			CreatedAt: e.CreatedAt,
		}
	}

	fmt.Println(output.FormatEntries(entries, getFormat))

	if getFormat != "json" {
		fmt.Println()
		msg := fmt.Sprintf("Showing %d entries.", result.Total)
		if result.Total >= limit {
			msg += " Use --limit to see more."
		}
		output.Info(output.Dim(msg))
	}

	return nil
}
