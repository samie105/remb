package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/useremb/remb/internal/api"
	"github.com/useremb/remb/internal/output"
	"github.com/spf13/cobra"
)

var memoryCmd = &cobra.Command{
	Use:     "memory",
	Aliases: []string{"mem"},
	Short:   "Manage AI memories — add, list, update, delete, and promote",
}

// ─── remb memory add ───────────────────────────────────────────────────

var memAddTitle string
var memAddContent string
var memAddTier string
var memAddCategory string
var memAddTags string
var memAddProject string

var memoryAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Create a new memory",
	RunE:  runMemoryAdd,
}

func runMemoryAdd(cmd *cobra.Command, args []string) error {
	fmt.Print("⠋ Creating memory...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	var tags []string
	if memAddTags != "" {
		for _, t := range strings.Split(memAddTags, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}

	result, err := client.CreateMemory(api.CreateMemoryRequest{
		Title:       memAddTitle,
		Content:     memAddContent,
		Tier:        memAddTier,
		Category:    memAddCategory,
		Tags:        tags,
		ProjectSlug: memAddProject,
	})
	fmt.Print("\r\033[K")
	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success("Memory created")
	output.KeyValue("ID", result.ID)
	output.KeyValue("Tier", result.Tier)
	output.KeyValue("Category", result.Category)
	output.KeyValue("Tokens", fmt.Sprintf("%d", result.TokenCount))
	return nil
}

// ─── remb memory list ──────────────────────────────────────────────────

var memListTier string
var memListCategory string
var memListSearch string
var memListProject string
var memListLimit string
var memListFormat string

var memoryListCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List memories",
	RunE:    runMemoryList,
}

func runMemoryList(cmd *cobra.Command, args []string) error {
	fmt.Print("⠋ Fetching memories...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	params := map[string]string{}
	if memListTier != "" {
		params["tier"] = memListTier
	}
	if memListCategory != "" {
		params["category"] = memListCategory
	}
	if memListSearch != "" {
		params["search"] = memListSearch
	}
	if memListProject != "" {
		params["project"] = memListProject
	}
	if memListLimit != "" {
		params["limit"] = memListLimit
	}

	result, err := client.ListMemories(params)
	fmt.Print("\r\033[K")
	if err != nil {
		handleAPIError(err)
	}

	if len(result.Memories) == 0 {
		output.Info("No memories found. Create one with: remb memory add -t \"Title\" -c \"Content\"")
		return nil
	}

	fmt.Fprintf(os.Stderr, "%sℹ%s %d memor%s found\n\n", "\033[36m", "\033[0m", result.Total, pluralize(result.Total, "y", "ies"))

	switch memListFormat {
	case "json":
		b, _ := json.MarshalIndent(result.Memories, "", "  ")
		fmt.Println(string(b))
	case "markdown":
		for _, m := range result.Memories {
			fmt.Printf("### %s\n", m.Title)
			fmt.Printf("- **Tier**: %s | **Category**: %s\n", m.Tier, m.Category)
			if len(m.Tags) > 0 {
				fmt.Printf("- **Tags**: %s\n", strings.Join(m.Tags, ", "))
			}
			fmt.Printf("- **Tokens**: %d | **ID**: %s\n", m.TokenCount, m.ID)
			fmt.Printf("\n%s\n\n", m.Content)
		}
	default:
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		for _, m := range result.Memories {
			tierColor := tierToColor(m.Tier)
			title := m.Title
			if len(title) > 50 {
				title = title[:47] + "..."
			}
			fmt.Fprintf(w, "%s[%s]\033[0m\t%s%s\033[0m\t%s%s\033[0m\t%s%dt\033[0m\n",
				tierColor, m.Tier, "\033[1m", title, "\033[2m", m.Category, "\033[2m", m.TokenCount)
			if len(m.Tags) > 0 {
				tagStr := make([]string, len(m.Tags))
				for i, t := range m.Tags {
					tagStr[i] = "#" + t
				}
				fmt.Fprintf(w, "\t%s%s\033[0m\t\t\n", "\033[2m", strings.Join(tagStr, " "))
			}
		}
		w.Flush()
	}

	return nil
}

// ─── remb memory update ────────────────────────────────────────────────

var memUpdateTitle string
var memUpdateContent string
var memUpdateTier string
var memUpdateCategory string
var memUpdateTags string

var memoryUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update an existing memory",
	Args:  cobra.ExactArgs(1),
	RunE:  runMemoryUpdate,
}

func runMemoryUpdate(cmd *cobra.Command, args []string) error {
	id := args[0]
	fmt.Print("⠋ Updating memory...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	req := api.UpdateMemoryRequest{}
	if memUpdateTitle != "" {
		req.Title = memUpdateTitle
	}
	if memUpdateContent != "" {
		req.Content = memUpdateContent
	}
	if memUpdateTier != "" {
		req.Tier = memUpdateTier
	}
	if memUpdateCategory != "" {
		req.Category = memUpdateCategory
	}
	if memUpdateTags != "" {
		var tags []string
		for _, t := range strings.Split(memUpdateTags, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
		req.Tags = tags
	}

	result, err := client.UpdateMemory(id, req)
	fmt.Print("\r\033[K")
	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success("Memory updated")
	output.KeyValue("Tier", result.Tier)
	output.KeyValue("Category", result.Category)
	output.KeyValue("Tokens", fmt.Sprintf("%d", result.TokenCount))
	return nil
}

// ─── remb memory delete ────────────────────────────────────────────────

var memoryDeleteCmd = &cobra.Command{
	Use:     "delete <id>",
	Aliases: []string{"rm"},
	Short:   "Delete a memory",
	Args:    cobra.ExactArgs(1),
	RunE:    runMemoryDelete,
}

func runMemoryDelete(cmd *cobra.Command, args []string) error {
	id := args[0]
	fmt.Print("⠋ Deleting memory...")

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	err = client.DeleteMemory(id)
	fmt.Print("\r\033[K")
	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success("Memory deleted")
	return nil
}

// ─── remb memory promote ───────────────────────────────────────────────

var memPromoteTo string

var memoryPromoteCmd = &cobra.Command{
	Use:   "promote <id>",
	Short: "Promote a memory to a higher tier (archive→active→core)",
	Args:  cobra.ExactArgs(1),
	RunE:  runMemoryPromote,
}

func runMemoryPromote(cmd *cobra.Command, args []string) error {
	id := args[0]
	fmt.Printf("⠋ Promoting memory to %s...", memPromoteTo)

	client, err := api.NewClient()
	if err != nil {
		fmt.Print("\r\033[K")
		output.Error(err.Error())
		os.Exit(1)
	}

	result, err := client.UpdateMemory(id, api.UpdateMemoryRequest{Tier: memPromoteTo})
	fmt.Print("\r\033[K")
	if err != nil {
		handleAPIError(err)
	}

	fmt.Println()
	output.Success(fmt.Sprintf("Memory promoted to %s", result.Tier))
	output.KeyValue("Title", result.Title)
	return nil
}

// ─── helpers ───────────────────────────────────────────────────────────

func tierToColor(tier string) string {
	switch tier {
	case "core":
		return "\033[33m" // yellow
	case "active":
		return "\033[36m" // cyan
	case "archive":
		return "\033[2m" // dim
	default:
		return ""
	}
}

func pluralize(n int, singular, plural string) string {
	if n == 1 {
		return singular
	}
	return plural
}

func init() {
	// add
	memoryAddCmd.Flags().StringVarP(&memAddTitle, "title", "t", "", "Memory title (required)")
	memoryAddCmd.Flags().StringVarP(&memAddContent, "content", "c", "", "Memory content (required)")
	memoryAddCmd.Flags().StringVar(&memAddTier, "tier", "active", "Memory tier: core, active, archive")
	memoryAddCmd.Flags().StringVar(&memAddCategory, "category", "general", "Category: preference, pattern, decision, correction, knowledge, general")
	memoryAddCmd.Flags().StringVar(&memAddTags, "tags", "", "Comma-separated tags")
	memoryAddCmd.Flags().StringVarP(&memAddProject, "project", "p", "", "Project slug")
	_ = memoryAddCmd.MarkFlagRequired("title")
	_ = memoryAddCmd.MarkFlagRequired("content")

	// list
	memoryListCmd.Flags().StringVar(&memListTier, "tier", "", "Filter by tier: core, active, archive")
	memoryListCmd.Flags().StringVar(&memListCategory, "category", "", "Filter by category")
	memoryListCmd.Flags().StringVarP(&memListSearch, "search", "s", "", "Search memories")
	memoryListCmd.Flags().StringVarP(&memListProject, "project", "p", "", "Filter by project")
	memoryListCmd.Flags().StringVarP(&memListLimit, "limit", "l", "20", "Max results")
	memoryListCmd.Flags().StringVar(&memListFormat, "format", "table", "Output format: table, json, markdown")

	// update
	memoryUpdateCmd.Flags().StringVarP(&memUpdateTitle, "title", "t", "", "New title")
	memoryUpdateCmd.Flags().StringVarP(&memUpdateContent, "content", "c", "", "New content")
	memoryUpdateCmd.Flags().StringVar(&memUpdateTier, "tier", "", "New tier")
	memoryUpdateCmd.Flags().StringVar(&memUpdateCategory, "category", "", "New category")
	memoryUpdateCmd.Flags().StringVar(&memUpdateTags, "tags", "", "Comma-separated tags")

	// promote
	memoryPromoteCmd.Flags().StringVar(&memPromoteTo, "to", "core", "Target tier: core, active")

	// register subcommands
	memoryCmd.AddCommand(memoryAddCmd)
	memoryCmd.AddCommand(memoryListCmd)
	memoryCmd.AddCommand(memoryUpdateCmd)
	memoryCmd.AddCommand(memoryDeleteCmd)
	memoryCmd.AddCommand(memoryPromoteCmd)

	// register with root
	rootCmd.AddCommand(memoryCmd)
}
