package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var Version = "0.2.0"

var rootCmd = &cobra.Command{
	Use:   "remb",
	Short: "Persistent memory layer for AI coding sessions",
	Long:  "Save, retrieve, and visualize project context — persistent memory layer for AI coding sessions.",
	CompletionOptions: cobra.CompletionOptions{
		HiddenDefaultCmd: true,
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.Version = Version
	rootCmd.SetVersionTemplate("remb v{{.Version}}\n")

	rootCmd.AddCommand(loginCmd)
	rootCmd.AddCommand(logoutCmd)
	rootCmd.AddCommand(whoamiCmd)
	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(saveCmd)
	rootCmd.AddCommand(getCmd)
	rootCmd.AddCommand(scanCmd)
	rootCmd.AddCommand(linkCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(pushCmd)
	rootCmd.AddCommand(historyCmd)
	rootCmd.AddCommand(importCmd)
}
