package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/output"
)

var pushProject string
var pushForce bool
var pushNoProgress bool

var pushCmd = &cobra.Command{
	Use:   "push",
	Short: "Push latest changes to Remb — triggers a cloud scan to update project context",
	RunE:  runPush,
}

func init() {
	pushCmd.Flags().StringVarP(&pushProject, "project", "p", "", "Project slug (reads from .remb.yml if omitted)")
	pushCmd.Flags().BoolVar(&pushForce, "force", false, "Skip git checks and trigger scan immediately")
	pushCmd.Flags().BoolVar(&pushNoProgress, "no-progress", false, "Don't poll for scan progress")
}

func runPush(cmd *cobra.Command, args []string) error {
	projectSlug := resolveProject(pushProject)

	if !pushForce {
		ok, branch, shortSha, msg, warning := checkGitStatusForPush()
		if !ok {
			output.Error(msg)
			os.Exit(1)
		}
		if warning != "" {
			output.Warn(warning)
		}
		fmt.Printf("  %sBranch:%s %s  %sLatest:%s %s — %s\n\n",
			"\033[2m", "\033[0m", branch,
			"\033[2m", "\033[0m", shortSha, msg,
		)
	}

	fmt.Print("⠋ Triggering cloud scan...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Println()
		handleAPIError(err)
		return nil
	}

	result, err := client.TriggerScan(projectSlug)
	if err != nil {
		fmt.Println()
		handleAPIError(err)
		return nil
	}

	fmt.Print("\r\033[K") // clear spinner line

	switch result.Status {
	case "started":
		output.Success(result.Message)
		if result.ScanID != "" && len(result.ScanID) >= 8 {
			fmt.Printf("  %sScan ID:%s %s\n", "\033[2m", "\033[0m", result.ScanID[:8])
		}
		if result.ScanID != "" && !pushNoProgress {
			fmt.Println()
			pollScanProgress(client, result.ScanID)
		} else {
			output.Info("The scan runs in the cloud — check the dashboard for progress.")
		}
	case "already_running":
		output.Warn(result.Message)
		if result.ScanID != "" && !pushNoProgress {
			fmt.Println()
			pollScanProgress(client, result.ScanID)
		}
	case "up_to_date":
		output.Info(result.Message)
	}

	return nil
}

func pollScanProgress(client *api.Client, scanID string) {
	spinFrames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	frame := 0
	printedFiles := make(map[string]bool)

	for {
		time.Sleep(2 * time.Second)

		status, err := client.GetScanStatus(scanID)
		if err != nil {
			continue // network blip, retry
		}

		if status.Status == "queued" {
			frame = (frame + 1) % len(spinFrames)
			fmt.Printf("\r\033[K%s Scan queued, waiting to start...", spinFrames[frame])
			continue
		}

		if status.Status == "running" {
			pct := status.Percentage
			bar := progressBar(pct, 20)
			frame = (frame + 1) % len(spinFrames)
			fmt.Printf("\r\033[K%s Scanning %s \033[1m%d%%\033[0m \033[2m(%d/%d files)\033[0m",
				spinFrames[frame], bar, pct, status.FilesScanned, status.FilesTotal)

			// Print new log entries above the progress line
			for _, log := range status.Logs {
				if printedFiles[log.File] {
					continue
				}
				printedFiles[log.File] = true
				fmt.Print("\r\033[K") // clear current line
				icon := "⠋"
				color := "\033[33m" // yellow
				switch log.Status {
				case "done":
					icon = "✓"
					color = "\033[32m" // green
				case "skipped":
					icon = "○"
					color = "\033[2m" // dim
				case "error":
					icon = "✗"
					color = "\033[31m" // red
				}
				feature := ""
				if log.Feature != "" {
					feature = fmt.Sprintf(" \033[36m→ %s\033[0m", log.Feature) // cyan
				}
				errMsg := ""
				if log.Status == "error" && log.Message != "" {
					errMsg = fmt.Sprintf(" \033[31m(%s)\033[0m", log.Message)
				}
				fmt.Printf("  %s%s\033[0m \033[2m%s\033[0m%s%s\n", color, icon, truncPath(log.File, 50), feature, errMsg)
			}
			continue
		}

		// Terminal states
		fmt.Print("\r\033[K") // clear spinner
		fmt.Println()

		switch status.Status {
		case "done":
			dur := ""
			if status.DurationMs > 0 {
				dur = fmt.Sprintf(" \033[2min %s\033[0m", formatDur(status.DurationMs))
			}
			output.Success(fmt.Sprintf("Scan complete — \033[1m%d\033[0m features from \033[1m%d\033[0m files%s",
				status.FeaturesCreated, status.FilesScanned, dur))
			if status.Errors > 0 {
				output.Warn(fmt.Sprintf("%d file(s) had errors during scanning.", status.Errors))
			}
		case "failed":
			output.Error("Scan failed. Check the dashboard for details.")
		}
		break
	}
}

func progressBar(pct, width int) string {
	filled := (pct * width) / 100
	empty := width - filled
	bar := ""
	for i := 0; i < filled; i++ {
		bar += "\033[32m█\033[0m"
	}
	for i := 0; i < empty; i++ {
		bar += "\033[2m░\033[0m"
	}
	return bar
}

func truncPath(p string, maxLen int) string {
	if len(p) <= maxLen {
		return p
	}
	return "…" + p[len(p)-(maxLen-1):]
}

func formatDur(ms int) string {
	secs := ms / 1000
	if secs < 60 {
		return fmt.Sprintf("%ds", secs)
	}
	mins := secs / 60
	rem := secs % 60
	return fmt.Sprintf("%dm %ds", mins, rem)
}

func checkGitStatusForPush() (ok bool, branch, shortSha, commitMsg, warning string) {
	_, err := exec.Command("git", "rev-parse", "--is-inside-work-tree").Output()
	if err != nil {
		return false, "", "", "Not inside a git repository.", ""
	}

	branchBytes, err := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		branch = "unknown"
	} else {
		branch = strings.TrimSpace(string(branchBytes))
	}

	shaBytes, err := exec.Command("git", "rev-parse", "--short", "HEAD").Output()
	if err != nil {
		return false, branch, "", "No commits found. Make at least one commit before pushing.", ""
	}
	shortSha = strings.TrimSpace(string(shaBytes))

	msgBytes, _ := exec.Command("git", "log", "-1", "--format=%s").Output()
	commitMsg = strings.TrimSpace(string(msgBytes))

	// Check uncommitted changes
	statusBytes, _ := exec.Command("git", "status", "--porcelain").Output()
	if strings.TrimSpace(string(statusBytes)) != "" {
		warning = "You have uncommitted changes. Only pushed commits will be scanned."
	}

	// Check if pushed to remote
	localShaBytes, _ := exec.Command("git", "rev-parse", "HEAD").Output()
	localSha := strings.TrimSpace(string(localShaBytes))
	remoteBranch := "origin/" + branch
	remoteShaBytes, err := exec.Command("git", "rev-parse", remoteBranch).Output()
	if err == nil {
		remoteSha := strings.TrimSpace(string(remoteShaBytes))
		if localSha != remoteSha {
			warning = "Local branch is ahead of remote. Run `git push` first so the cloud scanner has your latest code."
		}
	}

	return true, branch, shortSha, commitMsg, warning
}
