package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/richie/remb/internal/config"
	"github.com/richie/remb/internal/credentials"
)

// APIError represents an API error response.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return e.Message
}

// Client is the HTTP client for the remb API.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new API client, reading credentials from config/env.
func NewClient() (*Client, error) {
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

	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (c *Client) request(method, path string, body interface{}, params map[string]string) ([]byte, error) {
	u := c.baseURL + path

	if len(params) > 0 {
		q := url.Values{}
		for k, v := range params {
			if v != "" {
				q.Set(k, v)
			}
		}
		if qs := q.Encode(); qs != "" {
			u += "?" + qs
		}
	}

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, u, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("User-Agent", "remb-cli/0.1.0")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		msg := fmt.Sprintf("HTTP %d %s", resp.StatusCode, resp.Status)
		var errResp struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &errResp) == nil && errResp.Error != "" {
			msg = errResp.Error
		}
		return nil, &APIError{StatusCode: resp.StatusCode, Message: msg}
	}

	return data, nil
}

// SaveContextRequest is the payload for saving context.
type SaveContextRequest struct {
	ProjectSlug string   `json:"projectSlug"`
	FeatureName string   `json:"featureName"`
	Content     string   `json:"content"`
	EntryType   string   `json:"entryType,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// SaveContextResponse is the response from saving context.
type SaveContextResponse struct {
	ID          string `json:"id"`
	FeatureName string `json:"featureName"`
	CreatedAt   string `json:"created_at"`
}

// SaveContext saves a context entry.
func (c *Client) SaveContext(req SaveContextRequest) (*SaveContextResponse, error) {
	data, err := c.request("POST", "/api/cli/context/save", req, nil)
	if err != nil {
		return nil, err
	}
	var resp SaveContextResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// GetContextResponse is the response from getting context.
type GetContextResponse struct {
	Entries []ContextEntry `json:"entries"`
	Total   int            `json:"total"`
}

// ContextEntry is a single context entry.
type ContextEntry struct {
	ID        string      `json:"id"`
	Feature   string      `json:"feature"`
	Content   string      `json:"content"`
	EntryType string      `json:"entry_type"`
	Source    string      `json:"source"`
	Metadata  interface{} `json:"metadata"`
	CreatedAt string      `json:"created_at"`
}

// GetContext retrieves context entries.
func (c *Client) GetContext(projectSlug string, featureName string, limit int) (*GetContextResponse, error) {
	params := map[string]string{
		"projectSlug": projectSlug,
	}
	if featureName != "" {
		params["featureName"] = featureName
	}
	if limit > 0 {
		params["limit"] = fmt.Sprintf("%d", limit)
	}

	data, err := c.request("GET", "/api/cli/context/get", nil, params)
	if err != nil {
		return nil, err
	}
	var resp GetContextResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// SaveBatch saves multiple context entries concurrently.
func (c *Client) SaveBatch(projectSlug string, entries []SaveContextRequest) ([]*SaveContextResponse, error) {
	results := make([]*SaveContextResponse, len(entries))
	errs := make([]error, len(entries))
	var wg sync.WaitGroup

	// Limit concurrency to 5
	sem := make(chan struct{}, 5)

	for i, entry := range entries {
		wg.Add(1)
		go func(idx int, e SaveContextRequest) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			e.ProjectSlug = projectSlug
			resp, err := c.SaveContext(e)
			results[idx] = resp
			errs[idx] = err
		}(i, entry)
	}

	wg.Wait()

	// Return first error encountered
	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}
	return results, nil
}

// ─── Memory API ────────────────────────────────────────────────────────

// Memory represents a memory entry.
type Memory struct {
	ID             string   `json:"id"`
	Tier           string   `json:"tier"`
	Category       string   `json:"category"`
	Title          string   `json:"title"`
	Content        string   `json:"content"`
	Tags           []string `json:"tags"`
	TokenCount     int      `json:"token_count"`
	AccessCount    int      `json:"access_count"`
	ProjectID      *string  `json:"project_id"`
	LastAccessedAt *string  `json:"last_accessed_at"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
}

// ListMemoriesResponse is the response from listing memories.
type ListMemoriesResponse struct {
	Memories []Memory `json:"memories"`
	Total    int      `json:"total"`
}

// ListMemories retrieves memories with optional filters.
func (c *Client) ListMemories(params map[string]string) (*ListMemoriesResponse, error) {
	data, err := c.request("GET", "/api/cli/memory", nil, params)
	if err != nil {
		return nil, err
	}
	var resp ListMemoriesResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// CreateMemoryRequest is the payload for creating a memory.
type CreateMemoryRequest struct {
	Title       string   `json:"title"`
	Content     string   `json:"content"`
	Tier        string   `json:"tier,omitempty"`
	Category    string   `json:"category,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	ProjectSlug string   `json:"projectSlug,omitempty"`
}

// CreateMemoryResponse is the response from creating a memory.
type CreateMemoryResponse struct {
	ID         string `json:"id"`
	Tier       string `json:"tier"`
	Category   string `json:"category"`
	Title      string `json:"title"`
	TokenCount int    `json:"token_count"`
	CreatedAt  string `json:"created_at"`
}

// CreateMemory creates a new memory.
func (c *Client) CreateMemory(req CreateMemoryRequest) (*CreateMemoryResponse, error) {
	data, err := c.request("POST", "/api/cli/memory", req, nil)
	if err != nil {
		return nil, err
	}
	var resp CreateMemoryResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// UpdateMemoryRequest is the payload for updating a memory.
type UpdateMemoryRequest struct {
	Title    string   `json:"title,omitempty"`
	Content  string   `json:"content,omitempty"`
	Tier     string   `json:"tier,omitempty"`
	Category string   `json:"category,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

// UpdateMemoryResponse is the response from updating a memory.
type UpdateMemoryResponse struct {
	ID         string `json:"id"`
	Tier       string `json:"tier"`
	Category   string `json:"category"`
	Title      string `json:"title"`
	TokenCount int    `json:"token_count"`
	UpdatedAt  string `json:"updated_at"`
}

// UpdateMemory updates an existing memory.
func (c *Client) UpdateMemory(id string, req UpdateMemoryRequest) (*UpdateMemoryResponse, error) {
	data, err := c.request("PATCH", "/api/cli/memory/"+id, req, nil)
	if err != nil {
		return nil, err
	}
	var resp UpdateMemoryResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// DeleteMemory deletes a memory by ID.
func (c *Client) DeleteMemory(id string) error {
	_, err := c.request("DELETE", "/api/cli/memory/"+id, nil, nil)
	return err
}

// ─── Projects API ──────────────────────────────────────────────────────

// Project represents a project entry.
type Project struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Description  *string `json:"description"`
	RepoURL      *string `json:"repo_url"`
	RepoName     *string `json:"repo_name"`
	Language     *string `json:"language"`
	Branch       string  `json:"branch"`
	Status       string  `json:"status"`
	FeatureCount int     `json:"feature_count"`
	EntryCount   int     `json:"entry_count"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

// ListProjectsResponse is the response from listing projects.
type ListProjectsResponse struct {
	Projects []Project `json:"projects"`
	Total    int       `json:"total"`
}

// ListProjects retrieves the user's projects.
func (c *Client) ListProjects(params map[string]string) (*ListProjectsResponse, error) {
	data, err := c.request("GET", "/api/cli/projects", nil, params)
	if err != nil {
		return nil, err
	}
	var resp ListProjectsResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// CreateProjectRequest is the payload for creating a project.
type CreateProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	RepoURL     string `json:"repoUrl,omitempty"`
	RepoName    string `json:"repoName,omitempty"`
	Language    string `json:"language,omitempty"`
	Branch      string `json:"branch,omitempty"`
}

// CreateProjectResponse is the response from creating a project.
type CreateProjectResponse struct {
	Project struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Slug   string `json:"slug"`
		Status string `json:"status"`
	} `json:"project"`
	Created bool `json:"created"`
}

// CreateProject registers a project on the Remb server.
func (c *Client) CreateProject(req CreateProjectRequest) (*CreateProjectResponse, error) {
	data, err := c.request("POST", "/api/cli/projects", req, nil)
	if err != nil {
		return nil, err
	}
	var resp CreateProjectResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// TriggerScanResponse is the response from triggering a scan.
type TriggerScanResponse struct {
	ScanID  string `json:"scanId"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

// TriggerScan triggers a cloud scan for the given project.
func (c *Client) TriggerScan(projectSlug string) (*TriggerScanResponse, error) {
	body := map[string]string{"projectSlug": projectSlug}
	data, err := c.request("POST", "/api/cli/scan", body, nil)
	if err != nil {
		return nil, err
	}
	var resp TriggerScanResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// ScanStatusLog is a single log entry from the scan.
type ScanStatusLog struct {
	Timestamp string `json:"timestamp"`
	File      string `json:"file"`
	Status    string `json:"status"`
	Feature   string `json:"feature,omitempty"`
	Message   string `json:"message,omitempty"`
}

// ScanStatusResponse is the response from polling scan status.
type ScanStatusResponse struct {
	ScanID          string          `json:"scanId"`
	Status          string          `json:"status"`
	FilesTotal      int             `json:"filesTotal"`
	FilesScanned    int             `json:"filesScanned"`
	Percentage      int             `json:"percentage"`
	Logs            []ScanStatusLog `json:"logs"`
	FeaturesCreated int             `json:"featuresCreated"`
	Errors          int             `json:"errors"`
	DurationMs      int             `json:"durationMs"`
	StartedAt       *string         `json:"startedAt"`
	FinishedAt      *string         `json:"finishedAt"`
}

// GetScanStatus polls for scan job progress.
func (c *Client) GetScanStatus(scanId string) (*ScanStatusResponse, error) {
	data, err := c.request("GET", "/api/cli/scan", nil, map[string]string{"scanId": scanId})
	if err != nil {
		return nil, err
	}
	var resp ScanStatusResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// ── Conversation API ──────────────────────────────────────────────────────────

// ConversationEntry represents a single conversation history entry.
type ConversationEntry struct {
	ID        string                 `json:"id"`
	ProjectID *string                `json:"project_id"`
	SessionID string                 `json:"session_id"`
	Type      string                 `json:"type"`
	Content   string                 `json:"content"`
	Metadata  map[string]interface{} `json:"metadata"`
	Source    string                 `json:"source"`
	CreatedAt string                 `json:"created_at"`
}

// ConversationHistoryResponse is the response from the conversations endpoint.
type ConversationHistoryResponse struct {
	Entries []ConversationEntry `json:"entries"`
	Total   int                 `json:"total"`
}

// LogConversationRequest is the body for logging a conversation entry.
type LogConversationRequest struct {
	Content     string                 `json:"content"`
	ProjectSlug string                 `json:"projectSlug,omitempty"`
	Type        string                 `json:"type,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	SessionID   string                 `json:"sessionId,omitempty"`
}

// LogConversationResponse is the response after logging an entry.
type LogConversationResponse struct {
	Logged    bool   `json:"logged"`
	ID        string `json:"id"`
	CreatedAt string `json:"created_at"`
}

// GetConversationHistory fetches conversation history with optional filters.
func (c *Client) GetConversationHistory(params map[string]string) (*ConversationHistoryResponse, error) {
	data, err := c.request("GET", "/api/cli/conversations", nil, params)
	if err != nil {
		return nil, err
	}
	var resp ConversationHistoryResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}

// LogConversation logs a conversation entry via CLI.
func (c *Client) LogConversation(req LogConversationRequest) (*LogConversationResponse, error) {
	data, err := c.request("POST", "/api/cli/conversations", req, nil)
	if err != nil {
		return nil, err
	}
	var resp LogConversationResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}
