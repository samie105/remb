package cmd

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/useremb/remb/internal/config"
	"github.com/useremb/remb/internal/credentials"
	"github.com/useremb/remb/internal/output"
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

// mcpProxy proxies JSON-RPC messages between stdio and the Remb HTTP MCP endpoint.
// This means the CLI automatically exposes every tool the server knows about,
// with zero hardcoded tool definitions.
type mcpProxy struct {
	apiURL     string
	apiKey     string
	httpClient *http.Client
	sessionID  string
}

func newMcpProxy() (*mcpProxy, error) {
	apiKey := credentials.GetAPIKey()
	if apiKey == "" {
		return nil, fmt.Errorf("no API key found. Run `remb login` or set REMB_API_KEY")
	}

	cfg := config.FindProjectConfig("")
	baseURL := config.DefaultAPIURL
	if cfg != nil && cfg.Config.APIURL != "" {
		baseURL = cfg.Config.APIURL
	}
	baseURL = strings.TrimRight(baseURL, "/")

	return &mcpProxy{
		apiURL: baseURL + "/api/mcp",
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // generous for slow tool calls
		},
		sessionID: fmt.Sprintf("cli-%d", time.Now().UnixMilli()),
	}, nil
}

// forward sends a JSON-RPC message to the HTTP MCP endpoint and returns the
// response body. It handles both plain JSON and SSE (text/event-stream) responses
// by extracting data lines from SSE.
func (p *mcpProxy) forward(body []byte) ([]json.RawMessage, error) {
	req, err := http.NewRequest("POST", p.apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Mcp-Session-Id", p.sessionID)
	req.Header.Set("User-Agent", "remb-cli/"+Version)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 202 {
		return nil, nil // notification accepted, no response body
	}
	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(data))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	ct := resp.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "text/event-stream") {
		return parseSSE(data), nil
	}

	// Plain JSON — could be a single object or an array
	return []json.RawMessage{data}, nil
}

// parseSSE extracts JSON data lines from an SSE response body.
func parseSSE(body []byte) []json.RawMessage {
	var results []json.RawMessage
	scanner := bufio.NewScanner(bytes.NewReader(body))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			payload := strings.TrimPrefix(line, "data: ")
			results = append(results, json.RawMessage(payload))
		}
	}
	return results
}

func runServe(cmd *cobra.Command, args []string) error {
	projectSlug := serveProject
	if projectSlug == "" {
		cfg := config.FindProjectConfig("")
		if cfg != nil {
			projectSlug = cfg.Config.Project
		}
	}

	proxy, err := newMcpProxy()
	if err != nil {
		output.Error(err.Error())
		os.Exit(1)
	}

	fmt.Fprintln(os.Stderr, "Starting Remb MCP server (proxy mode)...")
	fmt.Fprintf(os.Stderr, "Endpoint: %s\n", proxy.apiURL)
	if projectSlug != "" {
		fmt.Fprintf(os.Stderr, "Default project: %s\n", projectSlug)
	}
	fmt.Fprintln(os.Stderr, "MCP server running (stdio → HTTP proxy)")

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024) // 1MB buffer

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		// Validate it's JSON-RPC before forwarding
		var peek struct {
			JSONRPC string          `json:"jsonrpc"`
			ID      json.RawMessage `json:"id,omitempty"`
			Method  string          `json:"method"`
		}
		if err := json.Unmarshal(line, &peek); err != nil {
			continue // skip malformed messages
		}

		// Notifications (no id) — fire-and-forget
		if peek.Method != "" && strings.HasPrefix(peek.Method, "notifications/") {
			go func(body []byte) {
				if _, err := proxy.forward(body); err != nil {
					fmt.Fprintf(os.Stderr, "notification forward error: %v\n", err)
				}
			}(append([]byte(nil), line...))
			continue
		}

		// Forward the message to the server
		responses, err := proxy.forward(line)
		if err != nil {
			// Return a JSON-RPC error to the caller
			errResp := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      json.RawMessage(peek.ID),
				"error": map[string]interface{}{
					"code":    -32603,
					"message": err.Error(),
				},
			}
			out, _ := json.Marshal(errResp)
			fmt.Fprintln(os.Stdout, string(out))
			continue
		}

		// Write all JSON-RPC responses to stdout
		for _, r := range responses {
			fmt.Fprintln(os.Stdout, string(r))
		}
	}

	return nil
}
