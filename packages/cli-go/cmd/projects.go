package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/richie/remb/internal/api"
	"github.com/richie/remb/internal/output"
	"github.com/spf13/cobra"
)

var projectsCmd = &cobra.Command{
	Use:     "projects",
	Aliases: []string{"proj"},
	Short:   "Manage projects — list and inspect",
}

// ─── remb projects list ────────────────────────────────────────────────

var projListStatus string
var projListLimit int
var projListFormat string

var projectsListCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List all projects",
	RunE:    runProjectsList,
}

func runProjectsList(cmd *cobra.Command, args []string) error {
	fmt.Print("⠋ Fetching projects...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	params := map[string]string{}
	if projListStatus != "" {
		params["status"] = projListStatus
	}
	if projListLimit > 0 {
		params["limit"] = fmt.Sprintf("%d", projListLimit)
	}

	resp, err := client.ListProjects(params)
	fmt.Print("\r\033[K")
	if err != nil {
		output.Error(err.Error())
		os.Exit(1)
	}

	if len(resp.Projects) == 0 {
		output.Info("No projects found. Create one with: remb init")
		return nil
	}

	output.Info(fmt.Sprintf("%d project%s found\n", resp.Total, plural(resp.Total)))

	switch projListFormat {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(resp.Projects)
	case "markdown":
		for _, p := range resp.Projects {
			fmt.Printf("### %s\n", p.Name)
			fmt.Printf("- **Slug**: %s | **Status**: %s\n", p.Slug, p.Status)
			fmt.Printf("- **Language**: %s | **Branch**: %s\n", derefOr(p.Language, "—"), p.Branch)
			fmt.Printf("- **Features**: %d | **Entries**: %d\n", p.FeatureCount, p.EntryCount)
			if p.Description != nil {
				fmt.Printf("- **Description**: %s\n", *p.Description)
			}
			if p.RepoURL != nil {
				fmt.Printf("- **Repo**: %s\n", *p.RepoURL)
			}
			fmt.Println()
		}
		return nil
	default:
		w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
		fmt.Fprintf(w, "STATUS\tNAME\tSLUG\tLANG\tFEATURES\tENTRIES\n")
		for _, p := range resp.Projects {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%d\t%d\n",
				p.Status,
				truncate(p.Name, 30),
				p.Slug,
				derefOr(p.Language, "—"),
				p.FeatureCount,
				p.EntryCount,
			)
		}
		return w.Flush()
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func derefOr(s *string, fallback string) string {
	if s != nil && *s != "" {
		return *s
	}
	return fallback
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

func init() {
	projectsListCmd.Flags().StringVar(&projListStatus, "status", "", "Filter by status")
	projectsListCmd.Flags().IntVarP(&projListLimit, "limit", "l", 50, "Max results")
	projectsListCmd.Flags().StringVar(&projListFormat, "format", "table", "Output format: table, json, markdown")

	projectsCmd.AddCommand(projectsListCmd)
	rootCmd.AddCommand(projectsCmd)
}
