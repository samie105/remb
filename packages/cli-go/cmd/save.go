package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/output"
	"github.com/spf13/cobra"
)

var saveFeature string
var saveContent string
var saveProject string
var saveTags string
var saveType string

var saveCmd = &cobra.Command{
	Use:   "save",
	Short: "Save a context entry for a project feature",
	RunE:  runSave,
}

func init() {
	saveCmd.Flags().StringVarP(&saveFeature, "feature", "f", "", "Feature or module name (required)")
	saveCmd.Flags().StringVarP(&saveContent, "content", "c", "", "Context content text (required)")
	saveCmd.Flags().StringVarP(&saveProject, "project", "p", "", "Project slug (reads from .remb.yml if omitted)")
	saveCmd.Flags().StringVarP(&saveTags, "tags", "t", "", "Comma-separated tags")
	saveCmd.Flags().StringVar(&saveType, "type", "manual", "Entry type")
	_ = saveCmd.MarkFlagRequired("feature")
	_ = saveCmd.MarkFlagRequired("content")
}

func runSave(cmd *cobra.Command, args []string) error {
	projectSlug := resolveProject(saveProject)

	var tags []string
	if saveTags != "" {
		for _, t := range strings.Split(saveTags, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}

	fmt.Print("⠋ Saving context entry...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	result, err := client.SaveContext(api.SaveContextRequest{
		ProjectSlug: projectSlug,
		FeatureName: saveFeature,
		Content:     saveContent,
		EntryType:   saveType,
		Tags:        tags,
	})

	fmt.Print("\r\033[K")

	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success(fmt.Sprintf("Context saved for %s", output.Bold(saveFeature)))
	output.KeyValue("ID", result.ID)
	output.KeyValue("Project", projectSlug)
	output.KeyValue("Feature", result.FeatureName)
	output.KeyValue("Created", result.CreatedAt)

	return nil
}
