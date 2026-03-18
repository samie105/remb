package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	"github.com/richie/remb/internal/api"
	"github.com/richie/remb/internal/config"
	"github.com/richie/remb/internal/output"
	"github.com/spf13/cobra"
)

var serveProject string

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the MCP server for AI tool integration",
	RunE:  runServe,
}

func init() {
	serveCmd.Flags().StringVar(&serveProject, "project", "", "Default project slug")
}

// JSON-RPC 2.0 types for MCP protocol
type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  interface{}     `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpToolDef struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

type mcpContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpToolResult struct {
	Content []mcpContent `json:"content"`
}

func runServe(cmd *cobra.Command, args []string) error {
	projectSlug := serveProject
	if projectSlug == "" {
		cfg := config.FindProjectConfig("")
		if cfg != nil {
			projectSlug = cfg.Config.Project
		}
	}

	client, err := api.NewClient()
	if err != nil {
		output.Error(err.Error())
		os.Exit(1)
	}

	// Log to stderr so it doesn't interfere with JSON-RPC on stdout
	fmt.Fprintln(os.Stderr, "Starting Remb MCP server...")
	if projectSlug != "" {
		fmt.Fprintf(os.Stderr, "Default project: %s\n", projectSlug)
	}
	fmt.Fprintln(os.Stderr, "MCP server running (stdio transport)")

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024) // 1MB buffer

	tools := buildToolDefs()

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req jsonRPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			continue // Skip malformed messages
		}

		var resp jsonRPCResponse
		resp.JSONRPC = "2.0"
		resp.ID = req.ID

		switch req.Method {
		case "initialize":
			resp.Result = map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"capabilities": map[string]interface{}{
					"tools": map[string]interface{}{},
				},
				"serverInfo": map[string]interface{}{
					"name":    "remb",
					"version": Version,
				},
			}

		case "notifications/initialized":
			continue // No response needed for notifications

		case "tools/list":
			resp.Result = map[string]interface{}{
				"tools": tools,
			}

		case "tools/call":
			resp.Result = handleToolCall(client, projectSlug, req.Params)

		case "ping":
			resp.Result = map[string]interface{}{}

		default:
			resp.Error = &jsonRPCError{
				Code:    -32601,
				Message: fmt.Sprintf("Method not found: %s", req.Method),
			}
		}

		out, _ := json.Marshal(resp)
		fmt.Fprintln(os.Stdout, string(out))
	}

	return nil
}

func buildToolDefs() []mcpToolDef {
	return []mcpToolDef{
		{
			Name:        "save_context",
			Description: "Save a context entry for a project feature. Use this to persist knowledge about a codebase feature, decision, or change.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"projectSlug": map[string]interface{}{
						"type":        "string",
						"description": "Project slug (uses default if omitted)",
					},
					"featureName": map[string]interface{}{
						"type":        "string",
						"description": "Feature or module name",
					},
					"content": map[string]interface{}{
						"type":        "string",
						"description": "The context text to save (max 50,000 chars)",
					},
					"entryType": map[string]interface{}{
						"type":        "string",
						"description": "Entry type: manual, scan, link, decision, note",
					},
					"tags": map[string]interface{}{
						"type":        "array",
						"items":       map[string]interface{}{"type": "string"},
						"description": "Tags for categorization",
					},
				},
				"required": []string{"featureName", "content"},
			},
		},
		{
			Name:        "get_context",
			Description: "Retrieve context entries for a project, optionally filtered by feature. Use this to recall past decisions, architecture notes, and feature knowledge.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"projectSlug": map[string]interface{}{
						"type":        "string",
						"description": "Project slug (uses default if omitted)",
					},
					"featureName": map[string]interface{}{
						"type":        "string",
						"description": "Filter by feature name",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Max entries to return (default 10, max 100)",
					},
				},
			},
		},
	}
}

func handleToolCall(client *api.Client, defaultProject string, params json.RawMessage) mcpToolResult {
	var call struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(params, &call); err != nil {
		return mcpToolResult{Content: []mcpContent{{Type: "text", Text: "Error: Invalid tool call params"}}}
	}

	switch call.Name {
	case "save_context":
		return handleSaveContext(client, defaultProject, call.Arguments)
	case "get_context":
		return handleGetContext(client, defaultProject, call.Arguments)
	default:
		return mcpToolResult{Content: []mcpContent{{Type: "text", Text: fmt.Sprintf("Error: Unknown tool %q", call.Name)}}}
	}
}

func handleSaveContext(client *api.Client, defaultProject string, args json.RawMessage) mcpToolResult {
	var params struct {
		ProjectSlug string   `json:"projectSlug"`
		FeatureName string   `json:"featureName"`
		Content     string   `json:"content"`
		EntryType   string   `json:"entryType"`
		Tags        []string `json:"tags"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return textResult("Error: Invalid arguments — " + err.Error())
	}

	slug := params.ProjectSlug
	if slug == "" {
		slug = defaultProject
	}
	if slug == "" {
		return textResult("Error: No project specified. Pass projectSlug or run with --project flag.")
	}

	result, err := client.SaveContext(api.SaveContextRequest{
		ProjectSlug: slug,
		FeatureName: params.FeatureName,
		Content:     params.Content,
		EntryType:   params.EntryType,
		Tags:        params.Tags,
	})
	if err != nil {
		return textResult("Error saving context: " + err.Error())
	}

	return textResult(fmt.Sprintf("Context saved successfully.\nID: %s\nFeature: %s\nCreated: %s",
		result.ID, result.FeatureName, result.CreatedAt))
}

func handleGetContext(client *api.Client, defaultProject string, args json.RawMessage) mcpToolResult {
	var params struct {
		ProjectSlug string `json:"projectSlug"`
		FeatureName string `json:"featureName"`
		Limit       int    `json:"limit"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return textResult("Error: Invalid arguments — " + err.Error())
	}

	slug := params.ProjectSlug
	if slug == "" {
		slug = defaultProject
	}
	if slug == "" {
		return textResult("Error: No project specified. Pass projectSlug or run with --project flag.")
	}

	result, err := client.GetContext(slug, params.FeatureName, params.Limit)
	if err != nil {
		return textResult("Error retrieving context: " + err.Error())
	}

	if len(result.Entries) == 0 {
		if params.FeatureName != "" {
			return textResult(fmt.Sprintf("No context entries found for feature %q in project %q.", params.FeatureName, slug))
		}
		return textResult(fmt.Sprintf("No context entries found for project %q.", slug))
	}

	text := fmt.Sprintf("Found %d entries:\n\n", result.Total)
	for i, e := range result.Entries {
		if i > 0 {
			text += "\n\n---\n\n"
		}
		date := e.CreatedAt
		if len(date) >= 10 {
			date = date[:10]
		}
		text += fmt.Sprintf("## %s [%s]\n_%s — %s_\n\n%s", e.Feature, e.EntryType, e.Source, date, e.Content)
	}

	return textResult(text)
}

func textResult(text string) mcpToolResult {
	return mcpToolResult{Content: []mcpContent{{Type: "text", Text: text}}}
}
