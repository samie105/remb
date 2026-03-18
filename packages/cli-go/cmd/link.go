package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/output"
	"github.com/spf13/cobra"
)

var linkFrom string
var linkTo string
var linkType string
var linkProject string

var linkCmd = &cobra.Command{
	Use:   "link",
	Short: "Link features together with dependency relationships",
	RunE:  runLink,
}

func init() {
	linkCmd.Flags().StringVar(&linkFrom, "from", "", "Source feature name (required)")
	linkCmd.Flags().StringVar(&linkTo, "to", "", "Target feature name (required)")
	linkCmd.Flags().StringVar(&linkType, "type", "depends_on", "Relationship: depends_on, extends, uses")
	linkCmd.Flags().StringVarP(&linkProject, "project", "p", "", "Project slug (reads from .remb.yml if omitted)")
	_ = linkCmd.MarkFlagRequired("from")
	_ = linkCmd.MarkFlagRequired("to")
}

func runLink(cmd *cobra.Command, args []string) error {
	projectSlug := resolveProject(linkProject)

	validTypes := []string{"depends_on", "extends", "uses"}
	valid := false
	for _, t := range validTypes {
		if linkType == t {
			valid = true
			break
		}
	}
	if !valid {
		output.Error(fmt.Sprintf("Invalid relationship type %q. Choose: %s", linkType, strings.Join(validTypes, ", ")))
		os.Exit(1)
	}

	fmt.Print("⠋ Creating feature link...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	content := fmt.Sprintf("Feature relationship: %s → %s → %s", linkFrom, linkType, linkTo)

	result, err := client.SaveContext(api.SaveContextRequest{
		ProjectSlug: projectSlug,
		FeatureName: linkFrom,
		Content:     content,
		EntryType:   "link",
		Tags:        []string{"relationship", linkType, linkTo},
	})

	fmt.Print("\r\033[K")

	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success(fmt.Sprintf("Linked %s → %s → %s",
		output.Bold(linkFrom), output.Cyan(linkType), output.Bold(linkTo)))
	output.KeyValue("ID", result.ID)
	output.KeyValue("Project", projectSlug)

	return nil
}
