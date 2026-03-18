package cmd

import (
	"fmt"
	"os"

	"github.com/richie/remb/internal/api"
	"github.com/richie/remb/internal/output"
	"github.com/richie/remb/internal/scanner"
	"github.com/spf13/cobra"
)

var scanProject string
var scanPath string
var scanDepth int
var scanIgnore string
var scanDryRun bool

var scanCmd = &cobra.Command{
	Use:   "scan",
	Short: "Auto-scan a directory to generate context entries",
	RunE:  runScan,
}

func init() {
	scanCmd.Flags().StringVarP(&scanProject, "project", "p", "", "Project slug (reads from .remb.yml if omitted)")
	scanCmd.Flags().StringVar(&scanPath, "path", ".", "Directory path to scan")
	scanCmd.Flags().IntVarP(&scanDepth, "depth", "d", 5, "Max recursion depth")
	scanCmd.Flags().StringVar(&scanIgnore, "ignore", "", "Comma-separated glob patterns to ignore")
	scanCmd.Flags().BoolVar(&scanDryRun, "dry-run", false, "Preview what would be scanned without saving")
}

func runScan(cmd *cobra.Command, args []string) error {
	projectSlug := resolveProject(scanProject)

	var ignorePatterns []string
	if scanIgnore != "" {
		for _, p := range splitAndTrim(scanIgnore) {
			if p != "" {
				ignorePatterns = append(ignorePatterns, p)
			}
		}
	}

	fmt.Print("⠋ Scanning directory...")

	files, results, err := scanner.ScanDirectory(scanner.ScanOptions{
		Path:   scanPath,
		Depth:  scanDepth,
		Ignore: ignorePatterns,
	})

	fmt.Print("\r\033[K")

	if err != nil {
		output.Error(fmt.Sprintf("Scan failed: %v", err))
		os.Exit(1)
	}

	if len(files) == 0 {
		output.Warn("No source files found in the target directory.")
		return nil
	}

	fmt.Println()
	output.Info(fmt.Sprintf("Found %s source files across %s directories.",
		output.Bold(fmt.Sprintf("%d", len(files))),
		output.Bold(fmt.Sprintf("%d", len(results)))))
	fmt.Println()

	for _, r := range results {
		tags := ""
		for _, t := range r.Tags {
			if t != "auto-scan" {
				if tags != "" {
					tags += ", "
				}
				tags += t
			}
		}
		fmt.Printf("  %s %s — %s — %.1fKB\n",
			output.Cyan("●"), output.Bold(r.FeatureName), tags,
			float64(len(r.Content))/1000)
	}
	fmt.Println()

	if scanDryRun {
		output.Info("Dry run — nothing was saved.")
		return nil
	}

	fmt.Printf("⠋ Saving %d context entries...", len(results))

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	// Convert scanner results to API requests
	entries := make([]api.SaveContextRequest, len(results))
	for i, r := range results {
		entries[i] = api.SaveContextRequest{
			FeatureName: r.FeatureName,
			Content:     r.Content,
			EntryType:   r.EntryType,
			Tags:        r.Tags,
		}
	}

	saved, err := client.SaveBatch(projectSlug, entries)

	fmt.Print("\r\033[K")

	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success(fmt.Sprintf("Uploaded %s context entries to %s",
		output.Bold(fmt.Sprintf("%d", len(saved))),
		output.Bold(projectSlug)))

	for _, entry := range saved {
		id := entry.ID
		if len(id) > 8 {
			id = id[:8]
		}
		output.KeyValue("  "+entry.FeatureName, id)
	}

	return nil
}

func splitAndTrim(s string) []string {
	parts := make([]string, 0)
	for _, p := range splitComma(s) {
		p = trimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func splitComma(s string) []string {
	result := make([]string, 0)
	current := ""
	for _, c := range s {
		if c == ',' {
			result = append(result, current)
			current = ""
		} else {
			current += string(c)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func trimSpace(s string) string {
	return fmt.Sprintf("%s", removeSpaces(s))
}

func removeSpaces(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
