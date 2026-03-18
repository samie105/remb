package cmd

import (
	"fmt"
	"os"

	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/config"
	"github.com/useremb/remb/internal/output"
)

// resolveProject resolves the project slug from flag or config file.
func resolveProject(flag string) string {
	if flag != "" {
		return flag
	}
	cfg := config.FindProjectConfig("")
	if cfg != nil && cfg.Config.Project != "" {
		return cfg.Config.Project
	}
	output.Error("No project specified. Use " + output.Bold("-p <slug>") + " or run " + output.Bold("remb init") + " in your project directory.")
	os.Exit(1)
	return ""
}

// handleAPIError prints an API error and exits.
func handleAPIError(err error) {
	if apiErr, ok := err.(*api.APIError); ok {
		output.Error(fmt.Sprintf("%s %s(HTTP %d)%s", apiErr.Message, "\033[2m", apiErr.StatusCode, "\033[0m"))
	} else {
		output.Error(err.Error())
	}
	os.Exit(1)
}
