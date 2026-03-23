package cmd

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/output"
	"github.com/useremb/remb/internal/scanner"
)

// spinnerFrames cycles through Braille dots to animate a loading indicator.
var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// startSpinner starts an animated spinner with the given label.
// Call the returned stop() function to halt and clear the line.
func startSpinner(label string) (stop func()) {
	var once sync.Once
	done := make(chan struct{})
	go func() {
		for i := 0; ; i++ {
			select {
			case <-done:
				return
			default:
				fmt.Printf("\r\033[K%s %s", spinnerFrames[i%len(spinnerFrames)], label)
				time.Sleep(80 * time.Millisecond)
			}
		}
	}()
	return func() {
		once.Do(func() {
			close(done)
			time.Sleep(90 * time.Millisecond) // let goroutine exit
			fmt.Print("\r\033[K")
		})
	}
}

var scanProject string
var scanPath string
var scanDepth int
var scanIgnore string
var scanDryRun bool
var scanLocal bool
var scanNoPoll bool

var scanCmd = &cobra.Command{
	Use:   "scan",
	Short: "Scan your project to extract features and context",
	Long: `Scan your project to extract features and context.

By default, triggers a server-side scan via GitHub (recommended).
Use --local to scan local files instead.`,
	Example: `  remb scan                        # Smart scan via GitHub (recommended)
  remb scan --local                # Scan local files
  remb scan --local --path src     # Scan specific directory
  remb scan --no-poll              # Start scan and exit immediately
  remb scan --local --dry-run      # Preview without saving`,
	RunE: runScan,
}

func init() {
	scanCmd.Flags().StringVarP(&scanProject, "project", "p", "", "Project slug (reads from .remb.yml if omitted)")
	scanCmd.Flags().BoolVar(&scanLocal, "local", false, "Scan local files instead of GitHub repository")
	scanCmd.Flags().StringVar(&scanPath, "path", ".", "Directory path for local scan")
	scanCmd.Flags().IntVarP(&scanDepth, "depth", "d", 5, "Max recursion depth for local scan")
	scanCmd.Flags().StringVar(&scanIgnore, "ignore", "", "Comma-separated glob patterns to ignore")
	scanCmd.Flags().BoolVar(&scanDryRun, "dry-run", false, "Preview what would be scanned without saving")
	scanCmd.Flags().BoolVar(&scanNoPoll, "no-poll", false, "Trigger scan without waiting for completion")
}

func runScan(cmd *cobra.Command, args []string) error {
	if scanLocal {
		return runLocalScan()
	}
	return runServerScan()
}

/* ── Server-side GitHub scan with live polling ──────────────────── */

func runServerScan() error {
	projectSlug := resolveProject(scanProject)

	client, err := api.NewClient()
	if err != nil {
		output.Error(err.Error())
		os.Exit(1)
	}

	stopCheckSpin := startSpinner(fmt.Sprintf("Checking %s for changes...", output.Bold(projectSlug)))

	result, err := client.TriggerScan(projectSlug)

	stopCheckSpin()

	if err != nil {
		output.Error(fmt.Sprintf("Failed to start scan: %v", err))
		os.Exit(1)
	}

	switch result.Status {
	case "up_to_date":
		output.Success("Already up to date — no new commits since last scan.")
		return nil

	case "already_running":
		output.Info("A scan is already running for this project.")
		if result.ScanID != "" && !scanNoPoll {
			return pollScan(client, result.ScanID)
		}
		return nil
	}

	if result.ScanID == "" {
		output.Error("Failed to start scan — no scan ID returned.")
		os.Exit(1)
	}

	output.Success(fmt.Sprintf("Scan started for %s", output.Bold(projectSlug)))

	if scanNoPoll {
		output.Info(fmt.Sprintf("Scan ID: %s", output.Dim(result.ScanID)))
		output.Info(fmt.Sprintf("Run %s to check progress.", output.Bold("remb scan -p "+projectSlug)))
		return nil
	}

	return pollScan(client, result.ScanID)
}

func pollScan(client *api.Client, scanID string) error {
	fmt.Println()
	stopInitSpin := startSpinner("Initializing...")
	firstPoll := true

	seenFiles := make(map[string]bool)
	lastFeature := ""
	shownMachineInfo := false

	for {
		status, err := client.GetScanStatus(scanID)
		if err != nil {
			// Network hiccup — retry silently
			time.Sleep(3 * time.Second)
			continue
		}

		// Stop the "Initializing..." spinner on first successful poll
		if firstPoll {
			stopInitSpin()
			firstPoll = false
		}

		// Show machine/sizing info once
		if !shownMachineInfo && status.Machine != nil {
			fmt.Print("\r\033[K")
			info := output.Bold(*status.Machine)
			if status.EstimatedFiles != nil {
				sizeStr := ""
				if status.EstimatedSizeKB != nil {
					if *status.EstimatedSizeKB >= 1024 {
						sizeStr = fmt.Sprintf(", ~%.1fMB", float64(*status.EstimatedSizeKB)/1024)
					} else {
						sizeStr = fmt.Sprintf(", ~%dKB", *status.EstimatedSizeKB)
					}
				}
				info += fmt.Sprintf(" (%d files%s)", *status.EstimatedFiles, sizeStr)
			}
			output.Info(fmt.Sprintf("Worker: %s", info))
			shownMachineInfo = true
		}

		if status.Status == "done" {
			fmt.Print("\r\033[K")
			printScanSummary(status)
			return nil
		}

		if status.Status == "failed" {
			fmt.Print("\r\033[K")
			output.Error("Scan failed.")
			for _, log := range status.Logs {
				if log.Status == "error" {
					msg := log.Message
					if msg == "" {
						msg = "unknown error"
					}
					fmt.Printf("  ✗ %s — %s\n", log.File, msg)
				}
			}
			os.Exit(1)
		}

		// Update progress
		pct := status.Percentage
		bar := renderProgressBar(pct, 24)
		fileInfo := ""
		if status.FilesTotal > 0 {
			fileInfo = fmt.Sprintf("%d/%d files", status.FilesScanned, status.FilesTotal)
		}

		// Track new features
		for _, log := range status.Logs {
			if log.Status == "done" && log.File != "" && !seenFiles[log.File] {
				seenFiles[log.File] = true
				if log.Feature != "" {
					lastFeature = log.Feature
				}
			}
		}

		featureStr := ""
		if lastFeature != "" {
			featureStr = fmt.Sprintf(" → %s", output.Cyan(lastFeature))
		}

		fmt.Printf("\r\033[K%s %s%s", bar, fileInfo, featureStr)

		time.Sleep(3 * time.Second)
	}
}

func renderProgressBar(pct int, width int) string {
	filled := (pct * width) / 100
	empty := width - filled
	return fmt.Sprintf("%s%s %s",
		"\033[32m"+strings.Repeat("█", filled)+"\033[0m",
		"\033[2m"+strings.Repeat("░", empty)+"\033[0m",
		output.Bold(fmt.Sprintf("%d%%", pct)))
}

func printScanSummary(status *api.ScanStatusResponse) {
	fmt.Println()
	output.Success("Scan complete!")
	fmt.Println()
	output.KeyValue("Files scanned", fmt.Sprintf("%d/%d", status.FilesScanned, status.FilesTotal))
	output.KeyValue("Features found", fmt.Sprintf("%d", status.FeaturesCreated))
	if status.Errors > 0 {
		output.KeyValue("Errors", fmt.Sprintf("\033[33m%d\033[0m", status.Errors))
	}
	output.KeyValue("Duration", formatDuration(status.DurationMs))
	if status.Machine != nil {
		output.KeyValue("Worker", *status.Machine)
	}

	// Show features discovered
	features := make([]string, 0)
	seen := make(map[string]bool)
	for _, log := range status.Logs {
		if log.Feature != "" && log.Status == "done" && !seen[log.Feature] {
			seen[log.Feature] = true
			features = append(features, log.Feature)
		}
	}
	if len(features) > 0 {
		fmt.Println()
		output.Info("Features discovered:")
		for _, f := range features {
			fmt.Printf("  %s %s\n", output.Cyan("●"), f)
		}
	}
	fmt.Println()
}

func formatDuration(ms int) string {
	if ms < 1000 {
		return fmt.Sprintf("%dms", ms)
	}
	seconds := ms / 1000
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}
	mins := seconds / 60
	secs := seconds % 60
	if secs > 0 {
		return fmt.Sprintf("%dm %ds", mins, secs)
	}
	return fmt.Sprintf("%dm", mins)
}

/* ── Local directory scan (legacy) ──────────────────────────────── */

func runLocalScan() error {
	projectSlug := resolveProject(scanProject)

	var ignorePatterns []string
	if scanIgnore != "" {
		for _, p := range splitAndTrim(scanIgnore) {
			if p != "" {
				ignorePatterns = append(ignorePatterns, p)
			}
		}
	}

	stopSpin := startSpinner("Scanning directory...")

	files, results, err := scanner.ScanDirectory(scanner.ScanOptions{
		Path:   scanPath,
		Depth:  scanDepth,
		Ignore: ignorePatterns,
	})

	stopSpin()

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

	stopSaveSpin := startSpinner(fmt.Sprintf("Saving %d context entries...", len(results)))

	client, err := api.NewClient()
	if err != nil {
		stopSaveSpin()
		output.Error(err.Error())
		os.Exit(1)
	}

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

	stopSaveSpin()

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
